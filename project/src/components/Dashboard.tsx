import { FormEvent, ReactNode, useMemo, useState } from 'react';
import {
  Activity,
  Cpu,
  LogIn,
  LogOut,
  Plus,
  RefreshCw,
  Router,
  ShieldCheck,
  Wifi,
} from 'lucide-react';
import HouseholdHealth from './HouseholdHealth';
import DeviceTopology from './DeviceTopology';
import QuorumOverrides from './QuorumOverrides';
import PredictiveBudget from './PredictiveBudget';
import AnomalyLab from './AnomalyLab';
import PrivacyView from './PrivacyView';
import { useLiveData } from '../lib/liveData';
import { formatDateTime } from '../lib/utils';

type Tab = 'overview' | 'topology' | 'overrides' | 'prediction' | 'anomalies' | 'privacy';
type DeviceType = 'phone' | 'tablet' | 'laptop';

const tabs: Array<{ id: Tab; name: string; kicker: string }> = [
  { id: 'overview', name: 'Household health', kicker: 'Live posture' },
  { id: 'prediction', name: 'Predictive budget', kicker: 'Forward view' },
  { id: 'topology', name: 'Device graph', kicker: 'Cross-device map' },
  { id: 'anomalies', name: 'Anomaly lab', kicker: 'Behavior drift' },
  { id: 'overrides', name: 'Overrides', kicker: 'Decision queue' },
  { id: 'privacy', name: 'Privacy', kicker: 'On-device semantics' },
];

export default function Dashboard() {
  const {
    actionError,
    anomalies,
    apiBaseUrl,
    authError,
    authenticate,
    budgets,
    busy,
    devices,
    email,
    events,
    health,
    heartbeat,
    isAuthenticated,
    isLive,
    lastSync,
    logout,
    refresh,
    registerDevice,
    registerUser,
    relationships,
    requests,
  } = useLiveData();

  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [emailInput, setEmailInput] = useState(email ?? '');
  const [passwordInput, setPasswordInput] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [deviceType, setDeviceType] = useState<DeviceType>('phone');
  const [devicePriority, setDevicePriority] = useState(6);

  const totalUsed = budgets.reduce((sum, budget) => sum + budget.used_seconds, 0);
  const totalBudget = budgets.reduce((sum, budget) => sum + budget.total_budget_seconds, 0);
  const totalPredicted = budgets.reduce((sum, budget) => sum + budget.predicted_usage_seconds, 0);
  const onlineDevices = devices.filter((device) => device.is_online).length;
  const pendingOverrides = requests.filter((request) => request.status === 'pending').length;

  const headline = useMemo(() => {
    if (isAuthenticated && devices.length === 0) {
      return 'Connected to ScreenTime backend. Register your first device to start the live household graph.';
    }

    if (isAuthenticated) {
      return 'Live backend mode is active. Device inventory, heartbeat state, and refresh cadence are coming from the ScreenTime service.';
    }

    return 'Preview mode is using the ScreenTime product model and live backend health to render a realistic household state without requiring sign-in.';
  }, [devices.length, isAuthenticated]);

  function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const action = authMode === 'login' ? authenticate(emailInput, passwordInput) : registerUser(emailInput, passwordInput);
    action.then(() => {
      setPasswordInput('');
    });
  }

  function handleRegisterDevice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!deviceName.trim()) {
      return;
    }

    registerDevice(deviceName.trim(), deviceType, devicePriority).then(() => {
      setDeviceName('');
      setDeviceType('phone');
      setDevicePriority(6);
    });
  }

  return (
    <div className="min-h-screen bg-app text-slate-100">
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />

      <div className="relative mx-auto max-w-7xl px-5 py-6 sm:px-6 lg:px-8">
        <header className="glass-panel mb-6 overflow-hidden rounded-[28px] border border-white/10 p-6 shadow-2xl shadow-slate-950/25">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <span className={`status-pill ${isLive ? 'status-live' : 'status-preview'}`}>
                  <Wifi className="h-4 w-4" />
                  {isLive ? 'Live backend session' : 'Preview mode'}
                </span>
                <span className={`status-pill ${health?.status === 'down' ? 'status-down' : 'status-health'}`}>
                  <ShieldCheck className="h-4 w-4" />
                  Backend health: {health?.status ?? 'checking'}
                </span>
                <span className="status-pill status-subtle">
                  <Router className="h-4 w-4" />
                  {apiBaseUrl}
                </span>
              </div>

              <p className="mb-3 text-sm uppercase tracking-[0.32em] text-cyan-200/80">ScreenSync Control Surface</p>
              <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                Make screen-time coordination feel operational, not static.
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">{headline}</p>
            </div>

            <div className="grid w-full gap-3 sm:grid-cols-2 lg:w-[380px]">
              <MetricCard label="Devices online" value={String(onlineDevices)} detail={`${devices.length} total nodes`} icon={<Activity className="h-5 w-5" />} />
              <MetricCard
                label="Today used"
                value={Math.round(totalUsed / 60).toString()}
                detail={`${Math.round(totalBudget / 60)} min budgeted`}
                icon={<Cpu className="h-5 w-5" />}
              />
              <MetricCard
                label="Predicted load"
                value={`${Math.round((totalPredicted / Math.max(totalBudget, 1)) * 100)}%`}
                detail="projected household usage"
                icon={<RefreshCw className="h-5 w-5" />}
              />
              <MetricCard
                label="Pending overrides"
                value={String(pendingOverrides)}
                detail={`${anomalies.length} anomaly flags`}
                icon={<ShieldCheck className="h-5 w-5" />}
              />
            </div>
          </div>
        </header>

        <section className="mb-6 grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
          <div className="glass-panel rounded-[26px] border border-white/10 p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Connection</p>
                <h2 className="mt-1 text-xl font-semibold text-white">
                  {isAuthenticated ? 'Linked to ScreenTime backend' : 'Ready to connect'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => refresh()}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-[1fr,auto] md:items-start">
              <div className="rounded-3xl border border-cyan-300/10 bg-slate-950/35 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`status-pill ${health?.status === 'down' ? 'status-down' : 'status-health'}`}>
                    {health?.status === 'down' ? 'Backend unreachable' : `Backend ${health?.status ?? 'checking'}`}
                  </span>
                  {lastSync && <span className="text-sm text-slate-400">Last sync {formatDateTime(lastSync)}</span>}
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-300">
                  {isAuthenticated
                    ? `Signed in as ${email}. Heartbeats and device registration actions are now routed into the real ScreenTime backend.`
                    : 'You can explore the dynamic preview immediately, or sign in with an existing ScreenTime backend account to switch to real device data.'}
                </p>
                {actionError && (
                  <div className="mt-4 rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                    {actionError}
                  </div>
                )}
              </div>

              {isAuthenticated ? (
                <button
                  type="button"
                  onClick={logout}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10"
                >
                  <LogOut className="h-4 w-4" />
                  Disconnect
                </button>
              ) : (
                <form onSubmit={handleLogin} className="grid gap-3 rounded-3xl border border-white/10 bg-slate-950/35 p-4 md:min-w-[280px]">
                  <div className="flex rounded-2xl bg-white/5 p-1">
                    <button type="button" onClick={() => setAuthMode('login')} className={`flex-1 rounded-xl px-3 py-2 text-sm ${authMode === 'login' ? 'bg-cyan-300 text-slate-950 font-semibold' : 'text-slate-300'}`}>Sign in</button>
                    <button type="button" onClick={() => setAuthMode('register')} className={`flex-1 rounded-xl px-3 py-2 text-sm ${authMode === 'register' ? 'bg-cyan-300 text-slate-950 font-semibold' : 'text-slate-300'}`}>Sign up</button>
                  </div>
                  <label className="grid gap-2 text-sm text-slate-300">
                    Backend email
                    <input
                      value={emailInput}
                      onChange={(event) => setEmailInput(event.target.value)}
                      type="email"
                      required
                      className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50 focus:bg-white/8"
                      placeholder="you@example.com"
                    />
                  </label>
                  <label className="grid gap-2 text-sm text-slate-300">
                    Password
                    <input
                      value={passwordInput}
                      onChange={(event) => setPasswordInput(event.target.value)}
                      type="password"
                      required
                      minLength={6}
                      className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50 focus:bg-white/8"
                      placeholder="At least 6 characters"
                    />
                  </label>
                  {authError && <p className="text-sm text-rose-200">{authError}</p>}
                  <button
                    type="submit"
                    disabled={busy}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <LogIn className="h-4 w-4" />
                    {authMode === 'login' ? 'Connect backend' : 'Create account'}
                  </button>
                </form>
              )}
            </div>
          </div>

          <div className="glass-panel rounded-[26px] border border-white/10 p-5">
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-3 text-cyan-200">
                <Plus className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Device intake</p>
                <h2 className="mt-1 text-xl font-semibold text-white">Register and check in devices</h2>
              </div>
            </div>

            <form onSubmit={handleRegisterDevice} className="grid gap-4">
              <label className="grid gap-2 text-sm text-slate-300">
                Device name
                <input
                  value={deviceName}
                  onChange={(event) => setDeviceName(event.target.value)}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50 focus:bg-white/8"
                  placeholder="Aarav's study laptop"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm text-slate-300">
                  Type
                  <select
                    value={deviceType}
                    onChange={(event) => setDeviceType(event.target.value as DeviceType)}
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-cyan-300/50 focus:bg-white/8"
                  >
                    <option value="phone">Phone</option>
                    <option value="tablet">Tablet</option>
                    <option value="laptop">Laptop</option>
                  </select>
                </label>

                <label className="grid gap-2 text-sm text-slate-300">
                  Priority {devicePriority}
                  <input
                    value={devicePriority}
                    onChange={(event) => setDevicePriority(Number(event.target.value))}
                    min={1}
                    max={10}
                    type="range"
                    className="accent-cyan-300"
                  />
                </label>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/8 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Plus className="h-4 w-4" />
                {isAuthenticated ? 'Register in backend' : 'Sign in to register'}
              </button>
            </form>

            {devices.length > 0 && (
              <div className="mt-4 grid gap-2">
                {devices.slice(0, 3).map((device) => (
                  <button
                    key={device.id}
                    type="button"
                    onClick={() => heartbeat(device.id)}
                    disabled={!isAuthenticated || busy}
                    className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/35 px-4 py-3 text-left transition hover:bg-white/8 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <div>
                      <p className="text-sm font-medium text-white">{device.name}</p>
                      <p className="text-xs text-slate-400">{device.type} · priority {device.priority}</p>
                    </div>
                    <span className={`status-pill ${device.is_online ? 'status-live' : 'status-subtle'}`}>
                      {device.is_online ? 'Heartbeat now' : 'Wake device'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        <nav className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-[24px] border p-4 text-left transition ${
                activeTab === tab.id
                  ? 'border-cyan-300/40 bg-cyan-300/12 shadow-lg shadow-cyan-950/20'
                  : 'border-white/10 bg-white/5 hover:bg-white/8'
              }`}
            >
              <p className="text-xs uppercase tracking-[0.22em] text-slate-400">{tab.kicker}</p>
              <p className="mt-2 text-base font-medium text-white">{tab.name}</p>
            </button>
          ))}
        </nav>

        <main>
          {activeTab === 'overview' && (
            <HouseholdHealth devices={devices} budgets={budgets} events={events} anomalies={anomalies} />
          )}
          {activeTab === 'prediction' && (
            <PredictiveBudget devices={devices} budgets={budgets} events={events} />
          )}
          {activeTab === 'topology' && (
            <DeviceTopology devices={devices} relationships={relationships} budgets={budgets} />
          )}
          {activeTab === 'anomalies' && (
            <AnomalyLab anomalies={anomalies} events={events} devices={devices} />
          )}
          {activeTab === 'overrides' && <QuorumOverrides requests={requests} devices={devices} />}
          {activeTab === 'privacy' && <PrivacyView events={events} devices={devices} />}
        </main>
      </div>
    </div>
  );
}

function MetricCard({
  detail,
  icon,
  label,
  value,
}: {
  detail: string;
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-slate-950/35 p-4">
      <div className="flex items-center justify-between text-cyan-200">
        {icon}
        <span className="text-xs uppercase tracking-[0.22em] text-slate-400">{label}</span>
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-tight text-white">{value}</p>
      <p className="mt-1 text-sm text-slate-400">{detail}</p>
    </div>
  );
}
