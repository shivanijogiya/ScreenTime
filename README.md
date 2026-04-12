# ScreenSync — Production-Grade Cross-Device Screen-Time Management System

> **Distributed Computing Project** | Author: Shivani Jogiya  
> Stack: FastAPI · PostgreSQL · MQTT · Redis · Federated ML

---

## 1. Refined Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                         │
│  Android (UsageStatsManager) · iOS (ScreenTime API) · Web   │
└───────────────────┬─────────────────────┬───────────────────┘
                    │ REST (register/auth) │ MQTT (real-time)
┌───────────────────▼─────────────────────▼───────────────────┐
│                      API GATEWAY (Nginx)                    │
│             Rate limiting · TLS termination · Routing       │
└───────────────────┬─────────────────────┬───────────────────┘
                    │                     │
         ┌──────────▼──────┐   ┌──────────▼──────────┐
         │  FastAPI Service │   │  MQTT Broker        │
         │  (Coordinator)   │   │  (Mosquitto + Auth)  │
         └──────────┬───────┘   └──────────┬───────────┘
                    │                      │
         ┌──────────▼──────────────────────▼───────────┐
         │              Event Bus (Redis Pub/Sub)       │
         └──┬───────────────┬──────────────┬────────────┘
            │               │              │
   ┌─────────▼───┐  ┌────────▼──────┐  ┌───▼──────────┐
   │  Decision   │  │  Sync Engine  │  │  ML Worker   │
   │  Engine     │  │  (State Mgr)  │  │  (Federated) │
   └─────────┬───┘  └────────┬──────┘  └───┬──────────┘
             │               │              │
   ┌──────────▼───────────────▼──────────────▼──────────┐
   │                   PostgreSQL + Redis Cache          │
   └─────────────────────────────────────────────────────┘
```

---

## 2. Novel Patent-Worthy Features

### Feature 1 — Predictive Budget Pre-allocation (PBP)

**What it does:** Instead of reacting to overuse, the system predicts usage 2 hours ahead using a lightweight LSTM per user and pre-allocates budgets across devices before limits are hit.  
**Patent angle:** Temporal lookahead budget management in distributed multi-device systems using on-device time-series prediction.

### Feature 2 — Topology-Aware Device Graph (TADG)

**What it does:** Builds a real-time graph of device relationships (e.g., phone + tablet = same user, same location, sequential usage). Budget flows through graph edges weighted by device priority and activity type.  
**Patent angle:** Graph-based cross-device usage orchestration with dynamic edge-weight recalculation.

### Feature 3 — Semantic App Classification with Local Inference

**What it does:** Apps are classified into semantically meaningful categories (productivity, passive entertainment, active social) using a compressed TFLite model running entirely on-device. Only the category label + duration is sent to the server — zero raw app data leaves the device.  
**Patent angle:** Privacy-preserving semantic classification for behavioral control without raw data transmission.

### Feature 4 — Quorum-Gated Emergency Override (QGEO)

**What it does:** A user requests extra screen time. The system checks 3 validators: (a) parent device approval, (b) time-of-day policy, (c) daily usage pattern. Override is granted only if 2-of-3 pass. All decisions are cryptographically signed and logged immutably.  
**Patent angle:** Multi-factor, consensus-based access control for parental governance in distributed IoT.

### Feature 5 — Federated Drift Detection

**What it does:** Each device trains a micro-model on its own behavioral data. Devices send only gradient deltas. The coordinator detects behavioral drift (e.g., a child's usage suddenly spikes at 2am) by comparing federated updates against a baseline without ever seeing raw usage data.  
**Patent angle:** Privacy-preserving anomaly detection in behavioral systems via federated gradient analysis.

---

## 3. System Modules

| Module                 | Responsibility                                      |
| ---------------------- | --------------------------------------------------- |
| `device_registry`      | Registration, heartbeat, online/offline tracking    |
| `usage_ingestion`      | Receives MQTT usage events, validates, stores       |
| `decision_engine`      | Budget computation, rebalancing, rule evaluation    |
| `sync_engine`          | Cross-device state consistency, conflict resolution |
| `fl_worker`            | Federated learning aggregation, drift detection     |
| `override_service`     | Quorum-based emergency override logic               |
| `notification_service` | Push alerts to devices via MQTT                     |
| `auth_service`         | OAuth 2.0, device token management                  |

---

## 4. Folder Structure

```
screensync/
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI entrypoint
│   │   ├── config.py                # Env config (pydantic-settings)
│   │   ├── database.py              # SQLAlchemy engine + session
│   │   │
│   │   ├── modules/
│   │   │   ├── device_registry/
│   │   │   │   ├── router.py
│   │   │   │   ├── service.py
│   │   │   │   └── models.py
│   │   │   ├── usage_ingestion/
│   │   │   │   ├── mqtt_listener.py
│   │   │   │   ├── service.py
│   │   │   │   └── schemas.py
│   │   │   ├── decision_engine/
│   │   │   │   ├── engine.py
│   │   │   │   ├── rules.py
│   │   │   │   └── budget.py
│   │   │   ├── sync_engine/
│   │   │   │   ├── sync.py
│   │   │   │   └── conflict.py
│   │   │   ├── fl_worker/
│   │   │   │   ├── aggregator.py
│   │   │   │   └── drift_detector.py
│   │   │   ├── override_service/
│   │   │   │   └── quorum.py
│   │   │   └── auth_service/
│   │   │       └── oauth.py
│   │   │
│   │   └── shared/
│   │       ├── mqtt_client.py       # Shared MQTT publish helper
│   │       ├── redis_client.py
│   │       └── exceptions.py
│   │
│   ├── alembic/                     # DB migrations
│   ├── tests/
│   ├── requirements.txt
│   └── .env
│
├── mobile/
│   ├── android/                     # Kotlin app
│   └── ios/                         # Swift app
│
├── infra/
│   ├── mosquitto.conf
│   ├── nginx.conf
│   └── docker-compose.yml
│
└── README.md
```

---

## 5. Setup Steps

### Prerequisites

- Python 3.11+
- PostgreSQL 15+
- Redis 7+
- Mosquitto MQTT Broker
- Node.js (optional, for mobile mock client)

---

### Step 1 — Clone & Configure

```bash
git clone https://github.com/your-repo/screensync.git
cd screensync/backend
cp .env.example .env
```

Edit `.env`:

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/screensync
REDIS_URL=redis://localhost:6379
MQTT_BROKER_HOST=localhost
MQTT_BROKER_PORT=1883
MQTT_USERNAME=screensync
MQTT_PASSWORD=secret
SECRET_KEY=your-secret-key
```

---

### Step 2 — Install Dependencies

```bash
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Linux/Mac
pip install -r requirements.txt
```

`requirements.txt`:

```
fastapi==0.111.0
uvicorn[standard]==0.29.0
sqlalchemy==2.0.30
alembic==1.13.1
psycopg2-binary==2.9.9
pydantic-settings==2.2.1
paho-mqtt==2.0.0
redis==5.0.4
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
httpx==0.27.0
pytest==8.2.0
```

---

### Step 3 — Database Setup

```bash
# Create DB
psql -U postgres -c "CREATE DATABASE screensync;"

# Run migrations
alembic upgrade head
```

---

### Step 4 — Start Services

```bash
# Terminal 1: MQTT Broker
"E:\Files\Mosquitto\mosquitto.exe" -v -c infra/mosquitto.conf

# Terminal 2: Redis
redis-server

# Terminal 3: Backend
cd backend
uvicorn app.main:app --reload --port 8001
```

API Docs: `http://127.0.0.1:8001/docs`

---

## 6. Database Schema

```sql
-- Core tables

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    hashed_password TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,                          -- "Shivani's Phone"
    type TEXT CHECK (type IN ('phone','tablet','laptop')),
    priority INTEGER DEFAULT 1,                  -- 1=low, 10=high
    last_heartbeat TIMESTAMPTZ,
    is_online BOOLEAN DEFAULT FALSE,
    registered_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE usage_events (
    id BIGSERIAL PRIMARY KEY,
    device_id UUID REFERENCES devices(id),
    app_category TEXT NOT NULL,                  -- 'productivity', 'social', 'entertainment'
    duration_seconds INTEGER NOT NULL,
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID REFERENCES devices(id),
    date DATE NOT NULL,
    total_budget_seconds INTEGER NOT NULL,
    used_seconds INTEGER DEFAULT 0,
    rebalanced_at TIMESTAMPTZ,
    UNIQUE(device_id, date)
);

CREATE TABLE override_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID REFERENCES devices(id),
    requested_seconds INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',               -- pending, approved, denied
    votes JSONB DEFAULT '{}',                    -- {"parent": true, "policy": false, "pattern": true}
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

CREATE TABLE fl_model_updates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID REFERENCES devices(id),
    gradient_delta BYTEA NOT NULL,              -- serialized numpy array
    round_number INTEGER NOT NULL,
    submitted_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_usage_device_date ON usage_events(device_id, recorded_at);
CREATE INDEX idx_budgets_device_date ON budgets(device_id, date);
```

---

## 7. API Design

### Device Registry

```
POST   /api/v1/devices/register        → Register device, returns device_id + token
POST   /api/v1/devices/{id}/heartbeat  → Update online status
GET    /api/v1/devices/                → List all user's devices
DELETE /api/v1/devices/{id}            → Deregister device
```

### Usage

```
POST   /api/v1/usage/report            → Manual usage report (fallback to MQTT)
GET    /api/v1/usage/summary?date=     → Daily usage per device
```

### Budget

```
GET    /api/v1/budget/today            → Get today's budget per device
POST   /api/v1/budget/rebalance        → Trigger manual rebalance
```

### Override

```
POST   /api/v1/override/request        → Request extra time
GET    /api/v1/override/{id}/status    → Check approval status
POST   /api/v1/override/{id}/vote      → Parent/admin votes
```

### Federated Learning

```
POST   /api/v1/fl/submit-update        → Device submits gradient delta
GET    /api/v1/fl/global-model         → Download aggregated model weights
```

---

## 8. MQTT Topic Design

```
screensync/
├── {user_id}/
│   ├── {device_id}/
│   │   ├── heartbeat          → QoS 1 | Payload: {"ts": 1720000000, "battery": 82}
│   │   ├── usage/report       → QoS 1 | Payload: {"category": "social", "secs": 300}
│   │   ├── budget/receive     → QoS 2 | Payload: {"remaining_secs": 3600}
│   │   ├── control/enforce    → QoS 2 | Payload: {"action": "warn"|"block"|"unlock"}
│   │   └── override/result    → QoS 2 | Payload: {"approved": true, "extra_secs": 600}
│   │
│   └── family/
│       ├── override/request   → QoS 2 | Broadcast to parent devices
│       └── sync/state         → QoS 1 | Full device-state snapshot
│
└── system/
    ├── alerts                 → QoS 1 | System-wide notifications
    └── fl/round               → QoS 1 | Federated learning round trigger
```

**QoS Policy:**

- Heartbeat → QoS 1 (at-least-once, tolerate duplicates)
- Budget enforcement → QoS 2 (exactly-once, critical)
- Usage reports → QoS 1 (minor duplicate cost acceptable)

---

## 9. Module-Wise Implementation Plan

### Phase 1 — Core Infrastructure (Week 1)

- [ ] `auth_service`: OAuth2 password flow, JWT tokens
- [ ] `device_registry`: register, heartbeat, online tracking
- [ ] MQTT listener wired to Redis Pub/Sub
- [ ] Alembic migrations for `users`, `devices`, `usage_events`

### Phase 2 — Real-Time Usage Pipeline (Week 2)

- [ ] `usage_ingestion`: MQTT → PostgreSQL pipeline
- [ ] `sync_engine`: Redis-backed state snapshot per device
- [ ] Conflict resolver: timestamp + priority-based last-write-wins with audit log

### Phase 3 — Decision Engine (Week 3)

- [ ] Daily budget initializer (cron at midnight)
- [ ] `decision_engine`: rule evaluator (time-of-day, category weights)
- [ ] Cross-device budget rebalancer
- [ ] MQTT enforcement publisher

### Phase 4 — Novel Features (Week 4)

- [ ] `override_service`: quorum voting logic
- [ ] Predictive budget pre-allocation (start with moving average, upgrade to LSTM)
- [ ] `fl_worker`: FedAvg gradient aggregation
- [ ] Drift detector: cosine similarity on gradient deltas

### Phase 5 — Hardening (Week 5)

- [ ] MQTT auth plugin (username/password per device)
- [ ] Redis caching for hot budget reads
- [ ] Docker Compose for full local stack
- [ ] Pytest suite (>80% coverage on core modules)

---

## 10. Key Design Decisions

| Decision            | Choice                      | Reason                                           |
| ------------------- | --------------------------- | ------------------------------------------------ |
| Message broker      | MQTT (Mosquitto)            | Low overhead for IoT-class devices               |
| Cache               | Redis                       | Sub-millisecond budget reads at enforcement time |
| Conflict resolution | Timestamp + device priority | Deterministic, no coordination round-trip needed |
| FL aggregation      | FedAvg                      | Standard, proven, low communication cost         |
| DB                  | PostgreSQL                  | JSONB for votes; strong ACID for budget records  |
| API style           | REST + MQTT hybrid          | REST for control plane, MQTT for data plane      |

---

## 11. Limitations & Mitigations

| Limitation                            | Mitigation                                        |
| ------------------------------------- | ------------------------------------------------- |
| iOS restricts background usage access | Use Screen Time API + HealthKit where permitted   |
| MQTT disconnects on mobile (battery)  | QoS 1 + persistent session + offline queue in app |
| Federated model convergence slow      | Limit to simple logistic regression for v1        |
| Network sync delays                   | Optimistic local enforcement + backend correction |

---

## Status

| Component        | Status         |
| ---------------- | -------------- |
| FastAPI backend  | ✅ Complete    |
| MQTT integration | ✅ Complete    |
| Real-time sync   | ✅ Working     |
| Decision engine  | 🔄 In progress |
| Federated ML     | 🔄 In progress |
| Mobile clients   | 📅 Planned     |
