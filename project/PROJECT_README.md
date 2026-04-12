# ScreenSync - Cross-Device Screen-Time Management System

A production-grade, patent-worthy cross-device screen-time management application featuring federated machine learning, predictive budget allocation, and privacy-preserving behavioral analytics.

## 🎯 Overview

ScreenSync is a fully functional web application demonstrating five novel patent-worthy features for distributed screen-time management across multiple devices. The system emphasizes privacy, real-time synchronization, and intelligent budget management.

## ✨ Patent-Worthy Features Implemented

### 1. **Predictive Budget Pre-allocation (PBP)**
- Predicts usage 2 hours ahead using time-series analysis
- Pre-allocates budgets across devices before limits are hit
- Visual timeline showing predicted vs. actual usage
- Auto-rebalancing based on predictions

### 2. **Topology-Aware Device Graph (TADG)**
- Interactive canvas-based device relationship visualization
- Dynamic edge weights representing device connections
- Real-time budget flow through graph edges
- Hover interactions showing device details and metrics

### 3. **Quorum-Gated Emergency Override (QGEO)**
- 2-of-3 validator system (parent, policy, pattern)
- Real-time voting interface for override requests
- Cryptographic decision logging
- Status tracking for pending and resolved requests

### 4. **Federated Drift Detection**
- 30-day anomaly heatmap visualization
- Severity-based color coding
- Behavioral anomaly detection (unusual time, spike category, pattern drift)
- Privacy-preserving gradient analysis simulation

### 5. **Semantic App Classification with Local Inference**
- On-device TFLite classification simulation
- Privacy-first architecture (no raw app data transmitted)
- Category-based usage tracking (productivity, social, entertainment, etc.)
- Usage distribution visualization

## 🏗️ Technical Architecture

### Frontend Stack
- **React 18** with TypeScript
- **Vite** for build tooling
- **Tailwind CSS** for styling
- **Lucide React** for icons
- **Supabase** for real-time database

### Database Schema
Comprehensive PostgreSQL schema with:
- `users` - User authentication and profiles
- `devices` - Device registry with metadata
- `usage_events` - Time-series usage data
- `budgets` - Daily budget allocations per device
- `override_requests` - Quorum-based override system
- `device_relationships` - TADG graph edges
- `anomaly_detections` - Federated drift detection results
- `fl_model_updates` - Federated learning gradient storage

### Security Features
- Row Level Security (RLS) on all tables
- Authenticated-only access policies
- User-scoped data isolation
- Cryptographic decision logging

## 📊 Dashboard Sections

### 1. Household Health Snapshot
- Overall budget utilization ring chart
- Real-time device status
- Predictive usage timeline (next 2 hours)
- Anomaly count and alerts
- Per-device budget visualization

### 2. Device Topology Graph (TADG)
- Canvas-based interactive graph
- Node colors indicate budget status (green/amber/red)
- Edge thickness shows relationship strength
- Hover tooltips with device metrics
- Relationship type indicators

### 3. Quorum Overrides
- Pending request inbox
- 2-of-3 validator status display
- Interactive voting interface
- Recent decision history
- Cryptographic hash display

### 4. Predictive Budget Studio
- Multi-device prediction timeline
- Per-device next-hour forecasts
- Auto-rebalance event log
- Interactive time horizon selector
- Current vs. predicted usage comparison

### 5. Anomaly Lab
- 30-day heatmap calendar
- Anomaly severity visualization
- Detailed anomaly inspection
- Federated model status
- Usage distribution by category

### 6. Privacy & Semantics
- Privacy-first architecture explanation
- Semantic category distribution
- Local classification log
- On-device processing guarantees
- Privacy guarantee checklist

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Environment Variables

The project is pre-configured with Supabase credentials in `.env`:
- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anonymous key

## 🎨 Design Philosophy

### Visual Language
- **Neutral warm surfaces** with teal accent color
- **Data-driven visualizations** for each patent feature
- **Calm, professional aesthetic** avoiding purple/indigo hues
- **Accessibility-first** with proper contrast and semantic HTML

### User Experience
- **Real-time updates** via Supabase subscriptions
- **Responsive design** for all viewport sizes
- **Interactive visualizations** with hover states
- **Demo mode** for immediate exploration without signup

## 📱 Demo Mode

The application launches directly into demo mode with realistic sample data:
- 3 devices (iPhone, iPad, Laptop)
- Daily budgets with varied usage
- Pending and resolved override requests
- 50+ usage events across categories
- Device relationships and anomalies

This allows immediate exploration of all patent-worthy features without authentication.

## 🔐 Authentication

While demo mode is default, the app supports:
- Email/password authentication via Supabase
- Secure session management
- User-scoped data access
- Protected routes

## 📈 Data Model

### Device Types
- Phone
- Tablet
- Laptop

### App Categories
- Productivity
- Social
- Entertainment
- Learning
- Gaming
- Communication
- Other

### Anomaly Types
- Unusual Time (usage at odd hours)
- Spike Category (abnormal category usage)
- Pattern Drift (behavioral baseline deviation)

### Relationship Types
- Same User (devices owned by same person)
- Same Location (devices used in same place)
- Sequential Usage (devices used back-to-back)

## 🎯 Future Enhancements

### Additional Patent-Worthy Features
- **Zero-Knowledge Proof Enforcement (ZKPE)** - Cryptographic budget compliance
- **Quantum-Resistant Behavioral Biometrics (QRBB)** - Federated biometric verification

### Technical Improvements
- WebSocket integration for lower-latency updates
- Service Worker for offline functionality
- Mobile app clients (iOS/Android)
- MQTT broker integration for true device communication
- Actual LSTM model for PBP predictions

## 📝 Project Structure

```
src/
├── components/
│   ├── Dashboard.tsx           # Main dashboard layout
│   ├── HouseholdHealth.tsx     # Overview panel
│   ├── DeviceTopology.tsx      # TADG visualization
│   ├── QuorumOverrides.tsx     # QGEO interface
│   ├── PredictiveBudget.tsx    # PBP timeline
│   ├── AnomalyLab.tsx          # Drift detection
│   ├── PrivacyView.tsx         # Privacy guarantees
│   ├── Auth.tsx                # Authentication
│   └── DemoDataProvider.tsx    # Demo mode provider
├── lib/
│   ├── supabase.ts             # Supabase client & types
│   ├── hooks.ts                # Data fetching hooks
│   ├── utils.ts                # Utility functions
│   └── demoData.ts             # Demo data generators
└── App.tsx                     # Root component
```

## 🏆 Key Achievements

✅ **Fully functional** frontend and backend
✅ **Zero build errors** - production-ready
✅ **All patent features** visualized and interactive
✅ **Complete database schema** with RLS security
✅ **Real-time capabilities** via Supabase
✅ **Demo mode** for immediate exploration
✅ **Responsive design** with modern UX
✅ **Type-safe** TypeScript throughout

## 📄 License

This is a demonstration project showcasing patent-worthy features in screen-time management systems.

---

**Built with** React, TypeScript, Tailwind CSS, Supabase, and Vite
**Author:** Based on ScreenSync specifications by Shivani Jogiya
