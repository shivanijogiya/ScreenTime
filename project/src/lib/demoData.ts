import { Device, Budget, OverrideRequest, UsageEvent, DeviceRelationship, AnomalyDetection } from './supabase';

const DEMO_USER_ID = 'demo-user-123';

export const demoDevices: Device[] = [
  {
    id: 'device-phone-1',
    user_id: DEMO_USER_ID,
    name: "Child's iPhone",
    type: 'phone',
    priority: 7,
    last_heartbeat: new Date().toISOString(),
    is_online: true,
    metadata: { os: 'iOS', version: '17.2' },
    registered_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'device-tablet-1',
    user_id: DEMO_USER_ID,
    name: "Child's iPad",
    type: 'tablet',
    priority: 5,
    last_heartbeat: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    is_online: false,
    metadata: { os: 'iOS', version: '17.1' },
    registered_at: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'device-laptop-1',
    user_id: DEMO_USER_ID,
    name: "Study Laptop",
    type: 'laptop',
    priority: 9,
    last_heartbeat: new Date().toISOString(),
    is_online: true,
    metadata: { os: 'macOS', version: '14.2' },
    registered_at: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

export const demoBudgets: Budget[] = [
  {
    id: 'budget-1',
    device_id: 'device-phone-1',
    date: new Date().toISOString().split('T')[0],
    total_budget_seconds: 7200,
    used_seconds: 5940,
    predicted_usage_seconds: 6480,
    rebalanced_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'budget-2',
    device_id: 'device-tablet-1',
    date: new Date().toISOString().split('T')[0],
    total_budget_seconds: 5400,
    used_seconds: 2160,
    predicted_usage_seconds: 2700,
    rebalanced_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'budget-3',
    device_id: 'device-laptop-1',
    date: new Date().toISOString().split('T')[0],
    total_budget_seconds: 10800,
    used_seconds: 4320,
    predicted_usage_seconds: 5400,
    rebalanced_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
  },
];

export const demoOverrideRequests: OverrideRequest[] = [
  {
    id: 'override-1',
    device_id: 'device-phone-1',
    user_id: DEMO_USER_ID,
    requested_seconds: 1800,
    reason: 'Need to finish homework assignment',
    status: 'pending',
    votes: {
      parent: true,
      policy: null,
      pattern: null,
    },
    approved_seconds: 0,
    requested_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    resolved_at: null,
  },
  {
    id: 'override-2',
    device_id: 'device-laptop-1',
    user_id: DEMO_USER_ID,
    requested_seconds: 3600,
    reason: 'Group project deadline',
    status: 'approved',
    votes: {
      parent: true,
      policy: true,
      pattern: false,
    },
    approved_seconds: 3600,
    requested_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    resolved_at: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'override-3',
    device_id: 'device-tablet-1',
    user_id: DEMO_USER_ID,
    requested_seconds: 900,
    reason: 'Watch educational video',
    status: 'denied',
    votes: {
      parent: false,
      policy: false,
      pattern: true,
    },
    approved_seconds: 0,
    requested_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    resolved_at: new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString(),
  },
];

export const demoUsageEvents: UsageEvent[] = [
  ...Array.from({ length: 50 }, (_, i) => ({
    id: i + 1,
    device_id: ['device-phone-1', 'device-tablet-1', 'device-laptop-1'][Math.floor(Math.random() * 3)],
    app_category: ['productivity', 'social', 'entertainment', 'learning', 'gaming', 'communication'][Math.floor(Math.random() * 6)],
    duration_seconds: Math.floor(Math.random() * 1800) + 300,
    recorded_at: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
  })),
];

export const demoDeviceRelationships: DeviceRelationship[] = [
  {
    id: 'rel-1',
    device_a_id: 'device-phone-1',
    device_b_id: 'device-tablet-1',
    relationship_type: 'same_user',
    weight: 0.85,
    last_updated: new Date().toISOString(),
  },
  {
    id: 'rel-2',
    device_a_id: 'device-phone-1',
    device_b_id: 'device-laptop-1',
    relationship_type: 'sequential_usage',
    weight: 0.72,
    last_updated: new Date().toISOString(),
  },
  {
    id: 'rel-3',
    device_a_id: 'device-tablet-1',
    device_b_id: 'device-laptop-1',
    relationship_type: 'same_location',
    weight: 0.65,
    last_updated: new Date().toISOString(),
  },
];

export const demoAnomalies: AnomalyDetection[] = [
  {
    id: 'anomaly-1',
    user_id: DEMO_USER_ID,
    device_id: 'device-phone-1',
    anomaly_type: 'unusual_time',
    severity: 0.87,
    details: {
      description: 'Unusual spike in social media usage at 2:30 AM',
      metrics: { hour: 2, category: 'social', deviation: 3.4 },
    },
    detected_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'anomaly-2',
    user_id: DEMO_USER_ID,
    device_id: 'device-laptop-1',
    anomaly_type: 'spike_category',
    severity: 0.65,
    details: {
      description: 'Gaming category usage 4.2× above baseline',
      metrics: { category: 'gaming', multiplier: 4.2 },
    },
    detected_at: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'anomaly-3',
    user_id: DEMO_USER_ID,
    device_id: 'device-tablet-1',
    anomaly_type: 'pattern_drift',
    severity: 0.45,
    details: {
      description: 'Usage pattern drifting from established baseline',
      metrics: { drift_score: 0.45, days_observed: 7 },
    },
    detected_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
  },
];
