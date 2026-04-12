import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase: any =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export interface User {
  id: string;
  email: string;
  role: 'parent' | 'child' | 'admin';
  created_at: string;
}

export interface Device {
  id: string;
  user_id: string;
  name: string;
  type: 'phone' | 'tablet' | 'laptop';
  priority: number;
  last_heartbeat: string | null;
  is_online: boolean;
  metadata: Record<string, unknown>;
  registered_at: string;
}

export interface UsageEvent {
  id: number;
  device_id: string;
  app_category: string;
  duration_seconds: number;
  recorded_at: string;
}

export interface Budget {
  id: string;
  device_id: string;
  date: string;
  total_budget_seconds: number;
  used_seconds: number;
  predicted_usage_seconds: number;
  rebalanced_at: string | null;
}

export interface OverrideRequest {
  id: string;
  device_id: string;
  user_id: string;
  requested_seconds: number;
  reason: string;
  status: 'pending' | 'approved' | 'denied';
  votes: {
    parent: boolean | null;
    policy: boolean | null;
    pattern: boolean | null;
  };
  approved_seconds: number;
  requested_at: string;
  resolved_at: string | null;
}

export interface DeviceRelationship {
  id: string;
  device_a_id: string;
  device_b_id: string;
  relationship_type: 'same_user' | 'same_location' | 'sequential_usage';
  weight: number;
  last_updated: string;
}

export interface AnomalyDetection {
  id: string;
  user_id: string;
  device_id: string | null;
  anomaly_type: 'unusual_time' | 'spike_category' | 'pattern_drift';
  severity: number;
  details: Record<string, unknown>;
  detected_at: string;
}
