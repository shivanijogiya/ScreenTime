import { useEffect, useState } from 'react';
import { supabase, Device, Budget, OverrideRequest, UsageEvent, DeviceRelationship, AnomalyDetection } from './supabase';

export function useDevices(userId: string | null) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setDevices([]);
      setLoading(false);
      return;
    }

    async function fetchDevices() {
      const { data, error } = await supabase
        .from('devices')
        .select('*')
        .eq('user_id', userId)
        .order('registered_at', { ascending: false });

      if (!error && data) {
        setDevices(data);
      }
      setLoading(false);
    }

    fetchDevices();

    const subscription = supabase
      .channel('devices-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'devices', filter: `user_id=eq.${userId}` }, () => {
        fetchDevices();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [userId]);

  return { devices, loading };
}

export function useBudgets(deviceIds: string[]) {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (deviceIds.length === 0) {
      setBudgets([]);
      setLoading(false);
      return;
    }

    async function fetchBudgets() {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('budgets')
        .select('*')
        .in('device_id', deviceIds)
        .eq('date', today);

      if (!error && data) {
        setBudgets(data);
      }
      setLoading(false);
    }

    fetchBudgets();

    const subscription = supabase
      .channel('budgets-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'budgets' }, () => {
        fetchBudgets();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [deviceIds.join(',')]);

  return { budgets, loading };
}

export function useOverrideRequests(userId: string | null) {
  const [requests, setRequests] = useState<OverrideRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setRequests([]);
      setLoading(false);
      return;
    }

    async function fetchRequests() {
      const { data, error } = await supabase
        .from('override_requests')
        .select('*')
        .eq('user_id', userId)
        .order('requested_at', { ascending: false })
        .limit(50);

      if (!error && data) {
        setRequests(data);
      }
      setLoading(false);
    }

    fetchRequests();

    const subscription = supabase
      .channel('override-requests-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'override_requests', filter: `user_id=eq.${userId}` }, () => {
        fetchRequests();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [userId]);

  return { requests, loading };
}

export function useUsageEvents(deviceIds: string[], days: number = 7) {
  const [events, setEvents] = useState<UsageEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (deviceIds.length === 0) {
      setEvents([]);
      setLoading(false);
      return;
    }

    async function fetchEvents() {
      const since = new Date();
      since.setDate(since.getDate() - days);

      const { data, error } = await supabase
        .from('usage_events')
        .select('*')
        .in('device_id', deviceIds)
        .gte('recorded_at', since.toISOString())
        .order('recorded_at', { ascending: false });

      if (!error && data) {
        setEvents(data);
      }
      setLoading(false);
    }

    fetchEvents();
  }, [deviceIds.join(','), days]);

  return { events, loading };
}

export function useDeviceRelationships(deviceIds: string[]) {
  const [relationships, setRelationships] = useState<DeviceRelationship[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (deviceIds.length === 0) {
      setRelationships([]);
      setLoading(false);
      return;
    }

    async function fetchRelationships() {
      const { data, error } = await supabase
        .from('device_relationships')
        .select('*')
        .or(`device_a_id.in.(${deviceIds.join(',')}),device_b_id.in.(${deviceIds.join(',')})`);

      if (!error && data) {
        setRelationships(data);
      }
      setLoading(false);
    }

    fetchRelationships();
  }, [deviceIds.join(',')]);

  return { relationships, loading };
}

export function useAnomalies(userId: string | null, days: number = 30) {
  const [anomalies, setAnomalies] = useState<AnomalyDetection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setAnomalies([]);
      setLoading(false);
      return;
    }

    async function fetchAnomalies() {
      const since = new Date();
      since.setDate(since.getDate() - days);

      const { data, error } = await supabase
        .from('anomaly_detections')
        .select('*')
        .eq('user_id', userId)
        .gte('detected_at', since.toISOString())
        .order('detected_at', { ascending: false });

      if (!error && data) {
        setAnomalies(data);
      }
      setLoading(false);
    }

    fetchAnomalies();
  }, [userId, days]);

  return { anomalies, loading };
}
