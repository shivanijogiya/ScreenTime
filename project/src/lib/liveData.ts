import { useEffect, useMemo, useState } from 'react';
import {
  BackendDevice,
  BackendHealth,
  fetchDevices,
  fetchHealth,
  getApiBaseUrl,
  login as loginRequest,
  register as registerRequest,
  registerDevice as registerDeviceRequest,
  sendHeartbeat,
} from './api';
import {
  AnomalyDetection,
  Budget,
  Device,
  DeviceRelationship,
  OverrideRequest,
  UsageEvent,
} from './supabase';
import { demoDevices } from './demoData';

const TOKEN_KEY = 'screensync.backend.token';
const EMAIL_KEY = 'screensync.backend.email';

type DeviceType = Device['type'];
type Category = 'productivity' | 'social' | 'entertainment' | 'learning' | 'gaming' | 'communication';

const CATEGORY_ORDER: Category[] = [
  'productivity',
  'social',
  'entertainment',
  'learning',
  'gaming',
  'communication',
];

const CATEGORY_WEIGHTS: Record<DeviceType, Record<Category, number>> = {
  laptop: {
    productivity: 0.34,
    social: 0.12,
    entertainment: 0.15,
    learning: 0.18,
    gaming: 0.11,
    communication: 0.1,
  },
  phone: {
    productivity: 0.12,
    social: 0.3,
    entertainment: 0.2,
    learning: 0.08,
    gaming: 0.12,
    communication: 0.18,
  },
  tablet: {
    productivity: 0.14,
    social: 0.18,
    entertainment: 0.24,
    learning: 0.18,
    gaming: 0.14,
    communication: 0.12,
  },
};

function loadPersistedToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function loadPersistedEmail() {
  return localStorage.getItem(EMAIL_KEY);
}

function persistAuth(token: string, email: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(EMAIL_KEY, email);
}

function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EMAIL_KEY);
}

function hashString(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function makePreviewDevices(now: Date): Device[] {
  return demoDevices.map((device, index) => ({
    ...device,
    last_heartbeat: new Date(now.getTime() - index * 18 * 60 * 1000).toISOString(),
    registered_at: new Date(now.getTime() - (index + 3) * 9 * 24 * 60 * 60 * 1000).toISOString(),
    is_online: index !== 1,
  }));
}

function normalizeDevices(devices: BackendDevice[]): Device[] {
  return devices.map((device) => ({
    ...device,
    metadata: {
      source: 'ScreenTime backend',
      tier: device.priority >= 8 ? 'high-focus' : device.priority >= 5 ? 'balanced' : 'light',
    },
  }));
}

function buildUsageEvents(devices: Device[], now: Date): UsageEvent[] {
  const events: UsageEvent[] = [];
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  let nextId = 1;

  devices.forEach((device, deviceIndex) => {
    const typeWeights = CATEGORY_WEIGHTS[device.type] ?? CATEGORY_WEIGHTS.phone;
    const registeredAt = new Date(device.registered_at);
    const activeDays = clamp(
      Math.floor((now.getTime() - registeredAt.getTime()) / (24 * 60 * 60 * 1000)),
      3,
      7,
    );

    for (let dayOffset = activeDays - 1; dayOffset >= 0; dayOffset -= 1) {
      const day = new Date(startOfToday);
      day.setDate(day.getDate() - dayOffset);

      CATEGORY_ORDER.forEach((category, categoryIndex) => {
        const dayKey = `${device.id}-${day.toISOString().slice(0, 10)}-${category}`;
        const intensity = 0.78 + (hashString(dayKey) % 45) / 100;
        const baseline = 450 + device.priority * 150;
        const dailyTotal = Math.round(baseline * intensity);
        const portion = typeWeights[category];
        const durationSeconds = Math.round(dailyTotal * portion);
        const hourBase = category === 'gaming' ? 20 : category === 'learning' ? 16 : 12;
        const minuteOffset = (hashString(`${dayKey}-minute`) % 40) + categoryIndex * 3;
        const eventTime = new Date(day);

        eventTime.setHours(
          clamp(hourBase + ((deviceIndex + categoryIndex) % 4) - (dayOffset === 0 ? 1 : 0), 8, 23),
          minuteOffset,
          0,
          0,
        );

        if (eventTime <= now) {
          events.push({
            id: nextId,
            device_id: device.id,
            app_category: category,
            duration_seconds: durationSeconds,
            recorded_at: eventTime.toISOString(),
          });
          nextId += 1;
        }
      });
    }
  });

  return events.sort(
    (left, right) => new Date(right.recorded_at).getTime() - new Date(left.recorded_at).getTime(),
  );
}

function buildBudgets(devices: Device[], events: UsageEvent[], now: Date): Budget[] {
  const today = now.toISOString().slice(0, 10);

  return devices.map((device, index) => {
    const totalBudgetSeconds = 5400 + device.priority * 900;
    const usedSeconds = events
      .filter((event) => event.device_id === device.id && event.recorded_at.startsWith(today))
      .reduce((sum, event) => sum + event.duration_seconds, 0);

    const recentEvents = events.filter((event) => event.device_id === device.id).slice(0, 6);
    const recentAverage = recentEvents.length
      ? recentEvents.reduce((sum, event) => sum + event.duration_seconds, 0) / recentEvents.length
      : usedSeconds / Math.max(now.getHours() || 1, 1);
    const predictedUsageSeconds = Math.round(
      clamp(usedSeconds + recentAverage * 1.6, usedSeconds, totalBudgetSeconds * 1.28),
    );

    return {
      id: `budget-${device.id}`,
      device_id: device.id,
      date: today,
      total_budget_seconds: totalBudgetSeconds,
      used_seconds: usedSeconds,
      predicted_usage_seconds: predictedUsageSeconds,
      rebalanced_at: new Date(now.getTime() - index * 47 * 60 * 1000).toISOString(),
    };
  });
}

function buildRelationships(devices: Device[], now: Date): DeviceRelationship[] {
  const relationships: DeviceRelationship[] = [];
  let index = 1;

  for (let left = 0; left < devices.length; left += 1) {
    for (let right = left + 1; right < devices.length; right += 1) {
      const first = devices[left];
      const second = devices[right];
      const delta = Math.abs(first.priority - second.priority);
      const relationshipType =
        first.type === second.type
          ? 'same_location'
          : left === 0
          ? 'same_user'
          : 'sequential_usage';

      relationships.push({
        id: `relationship-${index}`,
        device_a_id: first.id,
        device_b_id: second.id,
        relationship_type: relationshipType,
        weight: clamp(0.92 - delta * 0.06 - (left + right) * 0.03, 0.28, 0.92),
        last_updated: new Date(now.getTime() - index * 12 * 60 * 1000).toISOString(),
      });
      index += 1;
    }
  }

  return relationships;
}

function buildOverrideRequests(devices: Device[], budgets: Budget[], now: Date, isLive: boolean): OverrideRequest[] {
  const requests: Array<OverrideRequest | null> = devices
    .map((device, index) => {
      const budget = budgets.find((item) => item.device_id === device.id);
      if (!budget) {
        return null;
      }

      const pressure = budget.predicted_usage_seconds / Math.max(budget.total_budget_seconds, 1);
      if (pressure < 0.72 && index > 0) {
        return null;
      }

      const requestedSeconds = 900 + (hashString(device.id) % 4) * 600;
      const status = index === 0 ? 'pending' : pressure > 1 ? 'approved' : 'denied';
      const requestedAt = new Date(now.getTime() - (index + 1) * 55 * 60 * 1000).toISOString();

      return {
        id: `override-${device.id}`,
        device_id: device.id,
        user_id: device.user_id,
        requested_seconds: requestedSeconds,
        reason:
          status === 'approved'
            ? 'Homework session spilled into late evening focus time.'
            : status === 'denied'
            ? 'Entertainment request conflicts with the current quiet-hours rule.'
            : isLive
            ? 'Live device check-in suggests more study time may be needed.'
            : 'Preview mode request created from the current prediction model.',
        status,
        votes: {
          parent: status === 'pending' ? true : status === 'approved' ? true : null,
          policy: status === 'approved' ? true : status === 'denied' ? false : null,
          pattern: status === 'approved' ? false : status === 'denied' ? true : null,
        },
        approved_seconds: status === 'approved' ? requestedSeconds : 0,
        requested_at: requestedAt,
        resolved_at:
          status === 'pending'
            ? null
            : new Date(new Date(requestedAt).getTime() + 22 * 60 * 1000).toISOString(),
      };
    });

  return requests.filter((request): request is OverrideRequest => request !== null);
}

function buildAnomalies(
  devices: Device[],
  budgets: Budget[],
  events: UsageEvent[],
  now: Date,
): AnomalyDetection[] {
  const anomalies: AnomalyDetection[] = [];

  budgets.forEach((budget, index) => {
    const device = devices.find((item) => item.id === budget.device_id);
    if (!device) {
      return;
    }

    const usageRatio = budget.used_seconds / Math.max(budget.total_budget_seconds, 1);
    const deviceEvents = events.filter((event) => event.device_id === device.id);
    const gamingSeconds = deviceEvents
      .filter((event) => event.app_category === 'gaming')
      .reduce((sum, event) => sum + event.duration_seconds, 0);

    if (usageRatio > 0.82) {
      anomalies.push({
        id: `anomaly-usage-${device.id}`,
        user_id: device.user_id,
        device_id: device.id,
        anomaly_type: 'spike_category',
        severity: clamp(usageRatio, 0.35, 0.96),
        details: {
          description: `${device.name} is pacing above its normal daily allowance.`,
          metrics: {
            budget_used_percent: Math.round(usageRatio * 100),
            predicted_usage_seconds: budget.predicted_usage_seconds,
          },
        },
        detected_at: new Date(now.getTime() - index * 2.4 * 60 * 60 * 1000).toISOString(),
      });
    }

    if (gamingSeconds > 5400) {
      anomalies.push({
        id: `anomaly-gaming-${device.id}`,
        user_id: device.user_id,
        device_id: device.id,
        anomaly_type: 'pattern_drift',
        severity: clamp(0.42 + gamingSeconds / 18000, 0.42, 0.88),
        details: {
          description: `Gaming usage on ${device.name} is meaningfully above the weekly baseline.`,
          metrics: {
            gaming_seconds: gamingSeconds,
            weekly_events: deviceEvents.length,
          },
        },
        detected_at: new Date(now.getTime() - (index + 1) * 6.2 * 60 * 60 * 1000).toISOString(),
      });
    }
  });

  if (anomalies.length === 0 && devices[0]) {
    anomalies.push({
      id: `anomaly-time-${devices[0].id}`,
      user_id: devices[0].user_id,
      device_id: devices[0].id,
      anomaly_type: 'unusual_time',
      severity: 0.38,
      details: {
        description: 'The household graph is calm right now, with only a mild off-pattern late session.',
        metrics: { observed_hour: now.getHours() },
      },
      detected_at: new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString(),
    });
  }

  return anomalies.sort(
    (left, right) => new Date(right.detected_at).getTime() - new Date(left.detected_at).getTime(),
  );
}

function buildDashboardData(devices: Device[], now: Date, isLive: boolean) {
  const events = buildUsageEvents(devices, now);
  const budgets = buildBudgets(devices, events, now);
  const relationships = buildRelationships(devices, now);
  const requests = buildOverrideRequests(devices, budgets, now, isLive);
  const anomalies = buildAnomalies(devices, budgets, events, now);

  return { devices, events, budgets, relationships, requests, anomalies };
}

export function useLiveData() {
  const [token, setToken] = useState<string | null>(() => loadPersistedToken());
  const [email, setEmail] = useState<string | null>(() => loadPersistedEmail());
  const [health, setHealth] = useState<BackendHealth | null>(null);
  const [backendDevices, setBackendDevices] = useState<BackendDevice[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);

  useEffect(() => {
    const updateTime = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(updateTime);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const pollHealth = async () => {
      const nextHealth = await fetchHealth();
      if (!cancelled) {
        setHealth(nextHealth);
      }
    };

    pollHealth();
    const interval = window.setInterval(pollHealth, 15_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!token) {
      setBackendDevices([]);
      return;
    }

    let cancelled = false;

    const loadDevices = async () => {
      try {
        const devices = await fetchDevices(token);
        if (!cancelled) {
          setBackendDevices(devices);
          setLastSync(new Date().toISOString());
          setActionError(null);
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Unable to reach the ScreenTime backend.';
          setActionError(message);

          if (/401|403|expired|invalid/i.test(message)) {
            clearAuth();
            setToken(null);
            setEmail(null);
            setBackendDevices([]);
          }
        }
      }
    };

    loadDevices();
    const interval = window.setInterval(loadDevices, 20_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [token]);

  const devices = useMemo(() => {
    if (token) {
      return normalizeDevices(backendDevices);
    }

    return makePreviewDevices(now);
  }, [backendDevices, now, token]);

  const data = useMemo(() => buildDashboardData(devices, now, Boolean(token)), [devices, now, token]);

  const authenticate = async (nextEmail: string, password: string) => {
    setBusy(true);
    setAuthError(null);

    try {
      const response = await loginRequest(nextEmail, password);
      persistAuth(response.access_token, nextEmail);
      setToken(response.access_token);
      setEmail(nextEmail);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to sign in.');
    } finally {
      setBusy(false);
    }
  };

  const registerUser = async (nextEmail: string, password: string) => {
    setBusy(true);
    setAuthError(null);

    try {
      await registerRequest(nextEmail, password);
      const response = await loginRequest(nextEmail, password);
      persistAuth(response.access_token, nextEmail);
      setToken(response.access_token);
      setEmail(nextEmail);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to create account.');
    } finally {
      setBusy(false);
    }
  };

  const logout = () => {
    clearAuth();
    setToken(null);
    setEmail(null);
    setBackendDevices([]);
    setAuthError(null);
    setActionError(null);
  };

  const refresh = async () => {
    if (!token) {
      setLastSync(new Date().toISOString());
      return;
    }

    setBusy(true);

    try {
      const devices = await fetchDevices(token);
      setBackendDevices(devices);
      setLastSync(new Date().toISOString());
      setActionError(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Refresh failed.');
    } finally {
      setBusy(false);
    }
  };

  const registerDevice = async (name: string, type: DeviceType, priority: number) => {
    if (!token) {
      setActionError('Sign in to the ScreenTime backend before registering a device.');
      return;
    }

    setBusy(true);
    setActionError(null);

    try {
      await registerDeviceRequest(token, { name, type, priority });
      await refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Device registration failed.');
    } finally {
      setBusy(false);
    }
  };

  const heartbeat = async (deviceId: string) => {
    if (!token) {
      setActionError('Live heartbeat is only available when connected to the backend.');
      return;
    }

    setBusy(true);
    setActionError(null);

    try {
      await sendHeartbeat(token, deviceId, 50 + (hashString(deviceId) % 45));
      await refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Heartbeat failed.');
    } finally {
      setBusy(false);
    }
  };

  return {
    ...data,
    apiBaseUrl: getApiBaseUrl(),
    authError,
    actionError,
    busy,
    email,
    health,
    isAuthenticated: Boolean(token),
    isLive: Boolean(token),
    lastSync,
    authenticate,
    heartbeat,
    registerUser,
    logout,
    refresh,
    registerDevice,
  };
}

