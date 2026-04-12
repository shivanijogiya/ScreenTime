import { useState } from 'react';
import { AnomalyDetection, UsageEvent, Device } from '../lib/supabase';
import { formatDateTime, aggregateUsageByCategory, getCategoryColor } from '../lib/utils';
import { Microscope, AlertCircle, GitBranch } from 'lucide-react';

interface Props {
  anomalies: AnomalyDetection[];
  events: UsageEvent[];
  devices: Device[];
}

export default function AnomalyLab({ anomalies, events, devices }: Props) {
  const [selectedAnomaly, setSelectedAnomaly] = useState<AnomalyDetection | null>(null);

  const last30Days = Array.from({ length: 30 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (29 - index));
    return date.toISOString().split('T')[0];
  });

  const anomalyHeatmap = last30Days.map((date) => {
    const dayAnomalies = anomalies.filter((anomaly) => anomaly.detected_at.startsWith(date));
    const maxSeverity = Math.max(0, ...dayAnomalies.map((anomaly) => anomaly.severity));
    return { count: dayAnomalies.length, date, severity: maxSeverity };
  });

  const recentAnomalies = anomalies.slice(0, 10);
  const categoryUsage = aggregateUsageByCategory(events);

  function getSeverityColor(severity: number): string {
    if (severity === 0) return 'bg-slate-100';
    if (severity < 0.3) return 'bg-yellow-200';
    if (severity < 0.6) return 'bg-orange-300';
    if (severity < 0.8) return 'bg-rose-400';
    return 'bg-rose-600';
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-slate-200">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
            <Microscope className="w-5 h-5 text-teal-600" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Federated Drift Detection Lab</h2>
            <p className="text-sm text-slate-600">Privacy-preserving anomaly detection via federated gradient analysis</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-3">30-Day Anomaly Heatmap</h3>
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                <div className="grid grid-cols-10 gap-1.5">
                  {anomalyHeatmap.map((day) => (
                    <div
                      key={day.date}
                      className={`aspect-square rounded ${getSeverityColor(day.severity)} cursor-pointer hover:ring-2 hover:ring-teal-500 transition-all relative group`}
                      title={`${day.date}: ${day.count} anomalies, max severity ${Math.round(day.severity * 100)}%`}
                    >
                      {day.count > 0 && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-xs font-bold text-slate-700">{day.count}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Recent Anomalies</h3>
              <div className="space-y-2">
                {recentAnomalies.length === 0 ? (
                  <div className="text-center py-8 bg-slate-50 rounded-xl border border-slate-200">
                    <AlertCircle className="w-12 h-12 text-slate-400 mx-auto mb-2" />
                    <p className="text-sm text-slate-600">No anomalies detected</p>
                  </div>
                ) : (
                  recentAnomalies.map((anomaly) => {
                    const device = devices.find((item) => item.id === anomaly.device_id);
                    const severityPercent = Math.round(anomaly.severity * 100);
                    const description = typeof anomaly.details.description === 'string' ? anomaly.details.description : 'No description recorded.';

                    return (
                      <div
                        key={anomaly.id}
                        onClick={() => setSelectedAnomaly(anomaly)}
                        className="border border-slate-200 rounded-xl p-4 hover:border-rose-300 hover:shadow-md transition-all cursor-pointer"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <AlertCircle className={`w-4 h-4 ${anomaly.severity > 0.7 ? 'text-rose-600' : 'text-amber-600'}`} />
                              <span className="text-sm font-semibold text-slate-900 capitalize">{anomaly.anomaly_type.replace(/_/g, ' ')}</span>
                            </div>
                            <p className="text-xs text-slate-600 mb-2">{device?.name || 'Unknown device'} · {formatDateTime(anomaly.detected_at)}</p>
                            <p className="text-sm text-slate-700">{description}</p>
                          </div>
                          <div className="ml-4">
                            <div className={`px-3 py-1 rounded-full text-xs font-bold ${anomaly.severity > 0.7 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                              {severityPercent}%
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {selectedAnomaly && (
              <div className="bg-white border border-slate-200 rounded-xl p-4 sticky top-24">
                <h3 className="text-sm font-semibold text-slate-900 mb-4">Anomaly Details</h3>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-slate-500">Type</p>
                    <p className="text-sm font-medium text-slate-900 capitalize">{selectedAnomaly.anomaly_type.replace(/_/g, ' ')}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Severity</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${selectedAnomaly.severity > 0.7 ? 'bg-rose-500' : 'bg-amber-500'}`}
                          style={{ width: `${selectedAnomaly.severity * 100}%` }}
                        />
                      </div>
                      <span className="text-sm font-bold text-slate-900">{Math.round(selectedAnomaly.severity * 100)}%</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Detected</p>
                    <p className="text-sm font-medium text-slate-900">{formatDateTime(selectedAnomaly.detected_at)}</p>
                  </div>
                  {Boolean(selectedAnomaly.details.metrics) && (
                    <div>
                      <p className="text-xs text-slate-500 mb-2">Metrics</p>
                      <div className="bg-slate-50 rounded-lg p-2 text-xs font-mono text-slate-700 whitespace-pre-wrap">
                        {JSON.stringify(selectedAnomaly.details.metrics as Record<string, unknown>, null, 2)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">
                <GitBranch className="w-4 h-4 inline mr-1" />
                Federated Model Status
              </h3>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between"><span className="text-slate-600">Current Round:</span><span className="font-bold text-slate-900">#47</span></div>
                <div className="flex justify-between"><span className="text-slate-600">Model Version:</span><span className="font-medium text-slate-900">v12</span></div>
                <div className="flex justify-between"><span className="text-slate-600">Devices Contributing:</span><span className="font-medium text-slate-900">{devices.length}</span></div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Usage Distribution</h3>
              <div className="space-y-2">
                {categoryUsage.slice(0, 5).map(({ category, seconds }) => {
                  const totalSeconds = categoryUsage.reduce((sum, item) => sum + item.seconds, 0);
                  const percentage = totalSeconds > 0 ? (seconds / totalSeconds) * 100 : 0;

                  return (
                    <div key={category}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="capitalize text-slate-700">{category}</span>
                        <span className="font-medium text-slate-900">{Math.round(percentage)}%</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div className={`h-full rounded-full ${getCategoryColor(category).split(' ')[0].replace('-100', '-500')}`} style={{ width: `${percentage}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

