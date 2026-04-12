import { useMemo, useState } from 'react';
import { Device, Budget, UsageEvent } from '../lib/supabase';
import { formatDuration } from '../lib/utils';
import { TrendingUp, Zap, BarChart3 } from 'lucide-react';

interface Props {
  devices: Device[];
  budgets: Budget[];
  events: UsageEvent[];
}

export default function PredictiveBudget({ devices, budgets, events }: Props) {
  const [timeHorizon, setTimeHorizon] = useState(2);

  const deviceBudgetData = useMemo(
    () =>
      devices.map((device) => {
        const budget = budgets.find((item) => item.device_id === device.id);
        const totalBudget = budget?.total_budget_seconds || 7200;
        const currentUsage = budget?.used_seconds || 0;
        const predictedUsage = budget?.predicted_usage_seconds || currentUsage;
        const step = Math.max(0, (predictedUsage - currentUsage) / 6);
        const points = Array.from({ length: 12 }, (_, index) => Math.round(currentUsage + step * Math.min(index, 6)));

        return {
          budget,
          currentUsage,
          device,
          points,
          predictedUsage,
          totalBudget,
        };
      }),
    [budgets, devices],
  );

  const totalBudget = deviceBudgetData.reduce((sum, item) => sum + item.totalBudget, 0);
  const avgPredictions = Array.from({ length: 12 }, (_, index) =>
    Math.round(deviceBudgetData.reduce((sum, item) => sum + item.points[index], 0)),
  );

  const rebalanceEvents = budgets
    .filter((budget) => budget.rebalanced_at)
    .slice(0, 3)
    .map((budget) => {
      const device = devices.find((item) => item.id === budget.device_id);
      const shift = budget.predicted_usage_seconds - budget.used_seconds;
      return {
        change: `${shift >= 0 ? '+' : '-'}${formatDuration(Math.abs(shift))}`,
        device: device?.name ?? 'Unknown device',
        reason: shift >= 0 ? 'Prediction engine reserved buffer for evening use.' : 'Current trend is below the earlier allocation.',
        time: budget.rebalanced_at ?? '',
      };
    });

  const lastUsage = events[0];

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-slate-200">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-teal-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-slate-900">Predictive Budget Pre-allocation</h2>
            <p className="text-sm text-slate-600">Forecasted usage based on current device load and recent event cadence.</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600">Horizon:</label>
            <select
              value={timeHorizon}
              onChange={(event) => setTimeHorizon(Number(event.target.value))}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-teal-500"
            >
              <option value={1}>1 hour</option>
              <option value={2}>2 hours</option>
              <option value={4}>4 hours</option>
            </select>
          </div>
        </div>

        <div className="bg-gradient-to-br from-teal-50 to-blue-50 rounded-xl p-6 mb-6 border border-teal-100">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Household Prediction Timeline</h3>
          <div className="flex items-end gap-2 h-48">
            {avgPredictions.slice(0, timeHorizon * 6).map((predicted, index) => {
              const height = Math.min(100, (predicted / Math.max(totalBudget, 1)) * 100);
              const minutes = index * 10;

              return (
                <div key={index} className="flex-1 flex flex-col items-center gap-2">
                  <div className="w-full flex flex-col items-center gap-1">
                    <span className="text-xs font-medium text-slate-700">{formatDuration(predicted)}</span>
                    <div className="w-full bg-white rounded-lg h-32 border border-slate-200 flex flex-col justify-end overflow-hidden">
                      <div
                        className={`w-full transition-all ${index === 0 ? 'bg-gradient-to-t from-blue-500 to-blue-400' : 'bg-gradient-to-t from-teal-400 to-teal-300 opacity-80'}`}
                        style={{ height: `${height}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-xs text-slate-600 font-medium">{index === 0 ? 'Now' : `+${minutes}m`}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Per-Device Predictions</h3>
            <div className="space-y-3">
              {deviceBudgetData.map(({ currentUsage, device, predictedUsage, totalBudget }) => {
                const nextHourPrediction = Math.max(0, predictedUsage - currentUsage);
                const percentage = (currentUsage / Math.max(totalBudget, 1)) * 100;

                return (
                  <div key={device.id} className="border border-slate-200 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{device.name}</p>
                        <p className="text-xs text-slate-500">{formatDuration(currentUsage)} used so far</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-teal-600">+{formatDuration(nextHourPrediction)}</p>
                        <p className="text-xs text-slate-500">projected buffer</p>
                      </div>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${percentage < 70 ? 'bg-emerald-500' : percentage < 90 ? 'bg-amber-500' : 'bg-rose-500'}`}
                        style={{ width: `${Math.min(100, percentage)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-3">
              <Zap className="w-4 h-4 inline mr-1" />
              Auto-Rebalance Events
            </h3>
            <div className="space-y-2 mb-6">
              {rebalanceEvents.map((event, index) => (
                <div key={index} className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="text-xs text-slate-500">{event.time ? new Date(event.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Pending'}</p>
                      <p className="text-sm font-medium text-slate-900 mt-0.5">{event.device}</p>
                      <p className="text-xs text-slate-600 mt-1">{event.reason}</p>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${event.change.startsWith('+') ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                      {event.change}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <div className="flex items-start gap-2">
                <BarChart3 className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-blue-900 mb-2">What is driving the prediction</h3>
                  <ul className="text-xs text-blue-800 space-y-1.5 leading-relaxed">
                    <li>Latest event: {lastUsage ? `${lastUsage.app_category} for ${formatDuration(lastUsage.duration_seconds)}` : 'No recent event yet'}</li>
                    <li>Budgets are using device priority as the base allocator.</li>
                    <li>Forecasts expand from current usage toward the predicted end-of-window value.</li>
                    <li>The UI updates automatically as backend device state changes.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
