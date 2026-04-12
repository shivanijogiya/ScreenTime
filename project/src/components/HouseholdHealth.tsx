import { Device, Budget, UsageEvent, AnomalyDetection } from '../lib/supabase';
import { formatDuration, getUsagePercentage, getRiskLevel, getRiskColor, getBudgetColor } from '../lib/utils';
import { TrendingUp, AlertTriangle, Activity } from 'lucide-react';

interface Props {
  devices: Device[];
  budgets: Budget[];
  events: UsageEvent[];
  anomalies: AnomalyDetection[];
}

export default function HouseholdHealth({ devices, budgets, events, anomalies }: Props) {
  const totalBudget = budgets.reduce((sum, item) => sum + item.total_budget_seconds, 0);
  const totalUsed = budgets.reduce((sum, item) => sum + item.used_seconds, 0);
  const usagePercent = getUsagePercentage(totalUsed, totalBudget);
  const riskLevel = getRiskLevel(usagePercent);
  const recentAnomalies = anomalies.filter((anomaly) => {
    const dayAgo = new Date();
    dayAgo.setDate(dayAgo.getDate() - 1);
    return new Date(anomaly.detected_at) > dayAgo;
  });

  const nextTwoHoursProjection = budgets.reduce((sum, item) => {
    const delta = Math.max(0, item.predicted_usage_seconds - item.used_seconds);
    return sum + delta;
  }, 0);

  const projectionBars = budgets.map((budget) => ({
    id: budget.id,
    height: Math.min(100, (budget.predicted_usage_seconds / Math.max(totalBudget, 1)) * 100),
  }));

  const radius = 80;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (usagePercent / 100) * circumference;

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-teal-50 to-blue-50 rounded-2xl p-8 border border-teal-100">
        <h2 className="text-xl font-semibold text-slate-900 mb-6">Household Health Snapshot</h2>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="flex flex-col items-center justify-center">
            <div className="relative w-48 h-48">
              <svg className="transform -rotate-90 w-48 h-48">
                <circle cx="96" cy="96" r={radius} stroke="currentColor" strokeWidth="12" fill="none" className="text-slate-200" />
                <circle
                  cx="96"
                  cy="96"
                  r={radius}
                  stroke="currentColor"
                  strokeWidth="12"
                  fill="none"
                  className={getBudgetColor(usagePercent)}
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-bold text-slate-900">{Math.round(usagePercent)}%</span>
                <span className="text-sm text-slate-600 mt-1">Budget Used</span>
              </div>
            </div>
            <div className="mt-4 text-center">
              <p className="text-sm text-slate-600">{formatDuration(totalUsed)} of {formatDuration(totalBudget)}</p>
              <p className={`text-xs mt-1 font-medium ${getRiskColor(riskLevel)}`}>
                {riskLevel === 'low' ? 'Healthy' : riskLevel === 'medium' ? 'Caution' : 'High usage'}
              </p>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-xl p-6 border border-slate-200">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <TrendingUp className="w-5 h-5 text-teal-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-slate-900">Predictive Budget</h3>
                  <p className="text-sm text-slate-600 mt-1">
                    Expected usage in next 2 hours: <strong>{formatDuration(nextTwoHoursProjection)}</strong>
                  </p>
                  <div className="mt-3 flex items-end gap-2">
                    {projectionBars.map((bar, index) => (
                      <div key={bar.id} className="flex-1 flex flex-col items-center">
                        <div className="w-full bg-slate-100 rounded-sm h-16 flex items-end overflow-hidden">
                          <div
                            className={`w-full rounded-sm transition-all ${
                              bar.height < 70 ? 'bg-emerald-400' : bar.height < 90 ? 'bg-amber-400' : 'bg-rose-400'
                            }`}
                            style={{ height: `${bar.height}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-500 mt-1">D{index + 1}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-rose-100 rounded-lg flex items-center justify-center">
                    <AlertTriangle className="w-5 h-5 text-rose-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-slate-900">{recentAnomalies.length}</p>
                    <p className="text-xs text-slate-600">Anomalies (24h)</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-6 border border-slate-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Activity className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-slate-900">{devices.filter((device) => device.is_online).length}</p>
                    <p className="text-xs text-slate-600">Devices Online</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {recentAnomalies.length > 0 && (
          <div className="mt-6 p-4 bg-rose-50 border border-rose-200 rounded-lg">
            <h4 className="text-sm font-semibold text-rose-900 mb-2">Recent Anomalies</h4>
            <ul className="space-y-1">
              {recentAnomalies.slice(0, 3).map((anomaly) => (
                <li key={anomaly.id} className="text-sm text-rose-800">
                  {anomaly.anomaly_type.replace('_', ' ')} detected with severity {Math.round(anomaly.severity * 100)}%
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl p-6 border border-slate-200">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Device Overview</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {devices.map((device) => {
            const budget = budgets.find((item) => item.device_id === device.id);
            const percent = budget ? getUsagePercentage(budget.used_seconds, budget.total_budget_seconds) : 0;
            const recentEvents = events.filter((event) => event.device_id === device.id).slice(0, 3);

            return (
              <div key={device.id} className="border border-slate-200 rounded-xl p-4 hover:border-teal-300 transition-colors">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{device.name}</p>
                    <p className="text-xs text-slate-500 capitalize">{device.type}</p>
                  </div>
                  <div className={`w-2 h-2 rounded-full ${device.is_online ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                </div>

                {budget && (
                  <div>
                    <div className="flex justify-between text-xs text-slate-600 mb-2">
                      <span>{formatDuration(budget.used_seconds)}</span>
                      <span>{formatDuration(budget.total_budget_seconds)}</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          percent < 70 ? 'bg-emerald-500' : percent < 90 ? 'bg-amber-500' : 'bg-rose-500'
                        }`}
                        style={{ width: `${Math.min(100, percent)}%` }}
                      />
                    </div>
                    <p className="mt-3 text-xs text-slate-500">Projected finish: {formatDuration(budget.predicted_usage_seconds)}</p>
                    {recentEvents.length > 0 && (
                      <p className="mt-1 text-xs text-slate-500">
                        Latest: {recentEvents[0].app_category} for {formatDuration(recentEvents[0].duration_seconds)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
