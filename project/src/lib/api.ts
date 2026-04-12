export interface BackendHealth {
  status: 'ok' | 'degraded' | 'down';
  redis?: string;
  mqtt?: string;
}

export interface BackendTokenResponse {
  access_token: string;
  token_type: string;
}

export interface BackendDevice {
  id: string;
  user_id: string;
  name: string;
  type: 'phone' | 'tablet' | 'laptop';
  priority: number;
  is_online: boolean;
  last_heartbeat: string | null;
  registered_at: string;
}

export interface RegisterDeviceInput {
  name: string;
  type: BackendDevice['type'];
  priority: number;
}

const API_BASE =
  (import.meta.env.VITE_SCREENTIME_API_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://127.0.0.1:8001';

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;

    try {
      const data = await response.json();
      if (typeof data?.detail === 'string') {
        message = data.detail;
      }
    } catch {
      // Ignore JSON parse failures and keep the default message.
    }

    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export function getApiBaseUrl() {
  return API_BASE;
}

export async function fetchHealth(): Promise<BackendHealth> {
  try {
    const response = await fetch(`${API_BASE}/health`);
    return await parseJson<BackendHealth>(response);
  } catch {
    return { status: 'down' };
  }
}

export async function login(email: string, password: string): Promise<BackendTokenResponse> {
  const body = new URLSearchParams({ username: email, password });
  const response = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  return parseJson<BackendTokenResponse>(response);
}

export async function register(email: string, password: string) {
  const response = await fetch(`${API_BASE}/api/v1/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  return parseJson<{ id: string; email: string }>(response);
}

export async function fetchDevices(token: string): Promise<BackendDevice[]> {
  const response = await fetch(`${API_BASE}/api/v1/devices/`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return parseJson<BackendDevice[]>(response);
}

export async function registerDevice(token: string, input: RegisterDeviceInput): Promise<BackendDevice> {
  const response = await fetch(`${API_BASE}/api/v1/devices/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });

  return parseJson<BackendDevice>(response);
}

export async function sendHeartbeat(token: string, deviceId: string, battery?: number | null) {
  const response = await fetch(`${API_BASE}/api/v1/devices/${deviceId}/heartbeat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ battery: battery ?? null }),
  });

  return parseJson<{ device_id: string; is_online: boolean; timestamp: string }>(response);
}
