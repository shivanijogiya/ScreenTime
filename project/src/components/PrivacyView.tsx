import { UsageEvent, Device } from '../lib/supabase';
import { aggregateUsageByCategory, formatDuration, getCategoryColor } from '../lib/utils';
import { Lock, Shield, Smartphone, Database } from 'lucide-react';

interface Props {
  events: UsageEvent[];
  devices: Device[];
}

export default function PrivacyView({ events, devices }: Props) {
  const categoryData = aggregateUsageByCategory(events);
  const totalSeconds = categoryData.reduce((sum, c) => sum + c.seconds, 0);

  const mockAppClassifications = [
    { app: 'Instagram', category: 'social', confidence: 0.96, device: devices[0]?.name || 'Phone' },
    { app: 'Gmail', category: 'communication', confidence: 0.98, device: devices[0]?.name || 'Phone' },
    { app: 'YouTube', category: 'entertainment', confidence: 0.94, device: devices[1]?.name || 'Tablet' },
    { app: 'Notion', category: 'productivity', confidence: 0.99, device: devices[2]?.name || 'Laptop' },
    { app: 'Khan Academy', category: 'learning', confidence: 0.97, device: devices[1]?.name || 'Tablet' },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-slate-200">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
            <Lock className="w-5 h-5 text-teal-600" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Privacy & Semantic Classification</h2>
            <p className="text-sm text-slate-600">On-device inference with zero raw data transmission</p>
          </div>
        </div>

        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl p-6 mb-6 border border-emerald-200">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <Shield className="w-6 h-6 text-emerald-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-emerald-900 mb-2">Privacy-First Architecture</h3>
              <p className="text-sm text-emerald-800 leading-relaxed mb-4">
                Only category labels and durations leave each device. No raw app names, content, or usage patterns
                are ever uploaded to the server. All semantic classification happens locally using a compressed
                TFLite model running entirely on-device.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-white bg-opacity-80 rounded-lg p-3 border border-emerald-200">
                  <Smartphone className="w-5 h-5 text-emerald-600 mb-1" />
                  <p className="text-xs font-semibold text-emerald-900">On-Device Processing</p>
                  <p className="text-xs text-emerald-700 mt-1">TFLite classification</p>
                </div>
                <div className="bg-white bg-opacity-80 rounded-lg p-3 border border-emerald-200">
                  <Database className="w-5 h-5 text-emerald-600 mb-1" />
                  <p className="text-xs font-semibold text-emerald-900">Minimal Data Transfer</p>
                  <p className="text-xs text-emerald-700 mt-1">Labels + duration only</p>
                </div>
                <div className="bg-white bg-opacity-80 rounded-lg p-3 border border-emerald-200">
                  <Lock className="w-5 h-5 text-emerald-600 mb-1" />
                  <p className="text-xs font-semibold text-emerald-900">Zero Raw Data</p>
                  <p className="text-xs text-emerald-700 mt-1">No app names uploaded</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-4">Semantic Category Distribution</h3>
            <div className="space-y-3">
              {categoryData.map(({ category, seconds }) => {
                const percentage = totalSeconds > 0 ? (seconds / totalSeconds) * 100 : 0;
                const colorClass = getCategoryColor(category);

                return (
                  <div key={category} className="border border-slate-200 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`px-2.5 py-1 rounded-full text-xs font-medium ${colorClass}`}>
                          {category}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-slate-900">{Math.round(percentage)}%</p>
                        <p className="text-xs text-slate-500">{formatDuration(seconds)}</p>
                      </div>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${colorClass.split(' ')[0].replace('bg-', 'bg-').replace('-100', '-500')}`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-4">Local Classification Log</h3>
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
              <p className="text-xs text-slate-600 mb-3">
                Recent classifications performed on-device. Only the category and duration were transmitted.
              </p>
              <div className="space-y-2">
                {mockAppClassifications.map((item, i) => (
                  <div key={i} className="bg-white border border-slate-200 rounded-lg p-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-slate-900">&quot;{item.app}&quot;</span>
                          <span className="text-xs text-slate-400">→</span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getCategoryColor(item.category)}`}>
                            {item.category}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500">{item.device}</p>
                      </div>
                      <div className="ml-2">
                        <div className="text-xs text-slate-600">
                          <span className="font-medium">{Math.round(item.confidence * 100)}%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-blue-900 mb-2">Classification Model</h3>
              <div className="space-y-2 text-xs text-blue-800">
                <div className="flex justify-between">
                  <span>Model Type:</span>
                  <span className="font-medium">TFLite (Compressed)</span>
                </div>
                <div className="flex justify-between">
                  <span>Model Size:</span>
                  <span className="font-medium">2.4 MB</span>
                </div>
                <div className="flex justify-between">
                  <span>Inference Time:</span>
                  <span className="font-medium">&lt; 10ms</span>
                </div>
                <div className="flex justify-between">
                  <span>Categories:</span>
                  <span className="font-medium">7 semantic classes</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-6 border border-slate-200">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Privacy Guarantees</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-slate-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                ✓
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-900 mb-1">App Names Never Transmitted</h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  The actual app name (e.g., "Instagram") is classified locally and only the semantic category
                  (e.g., "social") is sent to the server.
                </p>
              </div>
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                ✓
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-900 mb-1">Content Always Private</h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  No screenshots, text content, or in-app activity data ever leaves the device. Only aggregated
                  time and category information.
                </p>
              </div>
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                ✓
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-900 mb-1">Federated Learning</h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Model improvements happen through gradient aggregation without raw data sharing. Each device
                  contributes to collective intelligence privately.
                </p>
              </div>
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                ✓
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-900 mb-1">Encrypted Transmission</h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  All category labels and usage duration data are transmitted over TLS-encrypted connections
                  with device authentication.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
