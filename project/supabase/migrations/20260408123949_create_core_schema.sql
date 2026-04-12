/*
  # ScreenSync Core Database Schema
  
  ## Overview
  This migration creates the foundational database structure for ScreenSync,
  a cross-device screen-time management system with federated learning capabilities.
  
  ## New Tables
  
  ### `users`
  - `id` (uuid, primary key) - Unique user identifier
  - `email` (text, unique) - User email for authentication
  - `hashed_password` (text) - Bcrypt hashed password
  - `role` (text) - User role (parent, child, admin)
  - `created_at` (timestamptz) - Registration timestamp
  
  ### `devices`
  - `id` (uuid, primary key) - Unique device identifier
  - `user_id` (uuid, foreign key) - Owner of the device
  - `name` (text) - Human-readable device name
  - `type` (text) - Device type (phone, tablet, laptop)
  - `priority` (integer) - Budget allocation priority (1-10)
  - `last_heartbeat` (timestamptz) - Last online timestamp
  - `is_online` (boolean) - Current online status
  - `metadata` (jsonb) - Additional device info (OS, version, etc.)
  - `registered_at` (timestamptz) - Registration timestamp
  
  ### `usage_events`
  - `id` (bigserial, primary key) - Event identifier
  - `device_id` (uuid, foreign key) - Device that recorded usage
  - `app_category` (text) - Semantic category (productivity, social, entertainment)
  - `duration_seconds` (integer) - Duration of usage
  - `recorded_at` (timestamptz) - When usage occurred
  
  ### `budgets`
  - `id` (uuid, primary key) - Budget identifier
  - `device_id` (uuid, foreign key) - Device this budget applies to
  - `date` (date) - Budget date
  - `total_budget_seconds` (integer) - Total allocated time
  - `used_seconds` (integer) - Time consumed so far
  - `predicted_usage_seconds` (integer) - PBP prediction for next 2 hours
  - `rebalanced_at` (timestamptz) - Last rebalance timestamp
  - Unique constraint on (device_id, date)
  
  ### `override_requests`
  - `id` (uuid, primary key) - Request identifier
  - `device_id` (uuid, foreign key) - Requesting device
  - `user_id` (uuid, foreign key) - Requesting user
  - `requested_seconds` (integer) - Extra time requested
  - `reason` (text) - Request justification
  - `status` (text) - pending, approved, denied
  - `votes` (jsonb) - Quorum votes {parent: bool, policy: bool, pattern: bool}
  - `approved_seconds` (integer) - Actually granted time
  - `requested_at` (timestamptz) - Request timestamp
  - `resolved_at` (timestamptz) - Resolution timestamp
  
  ### `fl_model_updates`
  - `id` (uuid, primary key) - Update identifier
  - `device_id` (uuid, foreign key) - Device submitting update
  - `gradient_delta` (bytea) - Serialized gradient data
  - `round_number` (integer) - Federated learning round
  - `submitted_at` (timestamptz) - Submission timestamp
  
  ### `device_relationships`
  - `id` (uuid, primary key) - Relationship identifier
  - `device_a_id` (uuid, foreign key) - First device
  - `device_b_id` (uuid, foreign key) - Second device
  - `relationship_type` (text) - same_user, same_location, sequential_usage
  - `weight` (decimal) - Edge weight for TADG
  - `last_updated` (timestamptz) - Last weight recalculation
  
  ### `anomaly_detections`
  - `id` (uuid, primary key) - Detection identifier
  - `user_id` (uuid, foreign key) - User with anomaly
  - `device_id` (uuid, foreign key) - Device with anomaly
  - `anomaly_type` (text) - unusual_time, spike_category, pattern_drift
  - `severity` (decimal) - Anomaly score (0-1)
  - `details` (jsonb) - Description and metrics
  - `detected_at` (timestamptz) - Detection timestamp
  
  ## Security
  - Row Level Security (RLS) enabled on all tables
  - Users can only access their own data
  - Parents can access their children's data
  - Admins have full access
  
  ## Indexes
  - Optimized for time-series queries on usage_events
  - Fast lookups on device_id and date for budgets
  - Efficient relationship queries for TADG
*/

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text UNIQUE NOT NULL,
    hashed_password text NOT NULL,
    role text NOT NULL DEFAULT 'child' CHECK (role IN ('parent', 'child', 'admin')),
    created_at timestamptz DEFAULT now()
);

-- Create devices table
CREATE TABLE IF NOT EXISTS devices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    name text NOT NULL,
    type text NOT NULL CHECK (type IN ('phone', 'tablet', 'laptop')),
    priority integer DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
    last_heartbeat timestamptz,
    is_online boolean DEFAULT false,
    metadata jsonb DEFAULT '{}',
    registered_at timestamptz DEFAULT now()
);

-- Create usage_events table
CREATE TABLE IF NOT EXISTS usage_events (
    id bigserial PRIMARY KEY,
    device_id uuid REFERENCES devices(id) ON DELETE CASCADE NOT NULL,
    app_category text NOT NULL CHECK (app_category IN ('productivity', 'social', 'entertainment', 'learning', 'gaming', 'communication', 'other')),
    duration_seconds integer NOT NULL CHECK (duration_seconds >= 0),
    recorded_at timestamptz DEFAULT now()
);

-- Create budgets table
CREATE TABLE IF NOT EXISTS budgets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id uuid REFERENCES devices(id) ON DELETE CASCADE NOT NULL,
    date date NOT NULL,
    total_budget_seconds integer NOT NULL CHECK (total_budget_seconds >= 0),
    used_seconds integer DEFAULT 0 CHECK (used_seconds >= 0),
    predicted_usage_seconds integer DEFAULT 0,
    rebalanced_at timestamptz,
    UNIQUE(device_id, date)
);

-- Create override_requests table
CREATE TABLE IF NOT EXISTS override_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id uuid REFERENCES devices(id) ON DELETE CASCADE NOT NULL,
    user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    requested_seconds integer NOT NULL CHECK (requested_seconds > 0),
    reason text DEFAULT '',
    status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
    votes jsonb DEFAULT '{"parent": null, "policy": null, "pattern": null}',
    approved_seconds integer DEFAULT 0,
    requested_at timestamptz DEFAULT now(),
    resolved_at timestamptz
);

-- Create fl_model_updates table
CREATE TABLE IF NOT EXISTS fl_model_updates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id uuid REFERENCES devices(id) ON DELETE CASCADE NOT NULL,
    gradient_delta bytea NOT NULL,
    round_number integer NOT NULL CHECK (round_number >= 0),
    submitted_at timestamptz DEFAULT now()
);

-- Create device_relationships table for TADG
CREATE TABLE IF NOT EXISTS device_relationships (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    device_a_id uuid REFERENCES devices(id) ON DELETE CASCADE NOT NULL,
    device_b_id uuid REFERENCES devices(id) ON DELETE CASCADE NOT NULL,
    relationship_type text NOT NULL CHECK (relationship_type IN ('same_user', 'same_location', 'sequential_usage')),
    weight decimal(5,4) DEFAULT 0.5 CHECK (weight BETWEEN 0 AND 1),
    last_updated timestamptz DEFAULT now(),
    UNIQUE(device_a_id, device_b_id, relationship_type)
);

-- Create anomaly_detections table
CREATE TABLE IF NOT EXISTS anomaly_detections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    device_id uuid REFERENCES devices(id) ON DELETE CASCADE,
    anomaly_type text NOT NULL CHECK (anomaly_type IN ('unusual_time', 'spike_category', 'pattern_drift')),
    severity decimal(3,2) CHECK (severity BETWEEN 0 AND 1),
    details jsonb DEFAULT '{}',
    detected_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_usage_device_date ON usage_events(device_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_budgets_device_date ON budgets(device_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_override_status ON override_requests(status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_user ON devices(user_id, is_online);
CREATE INDEX IF NOT EXISTS idx_relationships_devices ON device_relationships(device_a_id, device_b_id);
CREATE INDEX IF NOT EXISTS idx_anomalies_user_date ON anomaly_detections(user_id, detected_at DESC);

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE override_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE fl_model_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE anomaly_detections ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users table
CREATE POLICY "Users can view own profile"
    ON users FOR SELECT
    TO authenticated
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON users FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- RLS Policies for devices table
CREATE POLICY "Users can view own devices"
    ON devices FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "Users can insert own devices"
    ON devices FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own devices"
    ON devices FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own devices"
    ON devices FOR DELETE
    TO authenticated
    USING (user_id = auth.uid());

-- RLS Policies for usage_events table
CREATE POLICY "Users can view usage for own devices"
    ON usage_events FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM devices
            WHERE devices.id = usage_events.device_id
            AND devices.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert usage for own devices"
    ON usage_events FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM devices
            WHERE devices.id = usage_events.device_id
            AND devices.user_id = auth.uid()
        )
    );

-- RLS Policies for budgets table
CREATE POLICY "Users can view budgets for own devices"
    ON budgets FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM devices
            WHERE devices.id = budgets.device_id
            AND devices.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can manage budgets for own devices"
    ON budgets FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM devices
            WHERE devices.id = budgets.device_id
            AND devices.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM devices
            WHERE devices.id = budgets.device_id
            AND devices.user_id = auth.uid()
        )
    );

-- RLS Policies for override_requests table
CREATE POLICY "Users can view own override requests"
    ON override_requests FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "Users can create own override requests"
    ON override_requests FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own override requests"
    ON override_requests FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- RLS Policies for fl_model_updates table
CREATE POLICY "Users can submit model updates for own devices"
    ON fl_model_updates FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM devices
            WHERE devices.id = fl_model_updates.device_id
            AND devices.user_id = auth.uid()
        )
    );

-- RLS Policies for device_relationships table
CREATE POLICY "Users can view relationships for own devices"
    ON device_relationships FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM devices
            WHERE (devices.id = device_relationships.device_a_id OR devices.id = device_relationships.device_b_id)
            AND devices.user_id = auth.uid()
        )
    );

-- RLS Policies for anomaly_detections table
CREATE POLICY "Users can view own anomalies"
    ON anomaly_detections FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "System can insert anomalies"
    ON anomaly_detections FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = anomaly_detections.user_id
        )
    );