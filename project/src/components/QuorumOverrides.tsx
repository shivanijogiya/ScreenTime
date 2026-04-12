import { useEffect, useState } from 'react';
import { Device, OverrideRequest } from '../lib/supabase';
import { formatDuration, formatDateTime, calculateQuorumStatus } from '../lib/utils';
import { Shield, Check, X, Clock, FileText } from 'lucide-react';

interface Props {
  requests: OverrideRequest[];
  devices: Device[];
}

export default function QuorumOverrides({ requests, devices }: Props) {
  const [localRequests, setLocalRequests] = useState<OverrideRequest[]>(requests);
  const [selectedRequest, setSelectedRequest] = useState<OverrideRequest | null>(requests[0] ?? null);

  useEffect(() => {
    setLocalRequests(requests);
    setSelectedRequest((current) => requests.find((request) => request.id === current?.id) ?? requests[0] ?? null);
  }, [requests]);

  const pendingRequests = localRequests.filter((request) => request.status === 'pending');
  const resolvedRequests = localRequests.filter((request) => request.status !== 'pending');

  function handleVote(requestId: string, validator: 'parent' | 'policy' | 'pattern', approved: boolean) {
    setLocalRequests((current) =>
      current.map((request) => {
        if (request.id !== requestId) {
          return request;
        }

        const votes = { ...request.votes, [validator]: approved };
        const quorum = calculateQuorumStatus(votes);

        return {
          ...request,
          votes,
          status: quorum.total === 3 ? (quorum.approved ? 'approved' : 'denied') : request.status,
          approved_seconds: quorum.total === 3 && quorum.approved ? request.requested_seconds : request.approved_seconds,
          resolved_at: quorum.total === 3 ? new Date().toISOString() : request.resolved_at,
        };
      }),
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-slate-200">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
            <Shield className="w-5 h-5 text-teal-600" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Quorum-Gated Emergency Override (QGEO)</h2>
            <p className="text-sm text-slate-600">Interactive local decision simulation until the override API is exposed.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Pending Requests</h3>
              {pendingRequests.length === 0 ? (
                <div className="text-center py-8 bg-slate-50 rounded-xl border border-slate-200">
                  <Clock className="w-12 h-12 text-slate-400 mx-auto mb-2" />
                  <p className="text-sm text-slate-600">No pending override requests</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingRequests.map((request) => {
                    const device = devices.find((item) => item.id === request.device_id);
                    const quorum = calculateQuorumStatus(request.votes);

                    return (
                      <div
                        key={request.id}
                        onClick={() => setSelectedRequest(request)}
                        className="border border-slate-200 rounded-xl p-4 hover:border-teal-300 hover:shadow-md transition-all cursor-pointer"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-slate-900">{device?.name ?? 'Unknown device'}</p>
                            <p className="text-xs text-slate-500 mt-1">{formatDateTime(request.requested_at)}</p>
                            <p className="text-sm text-slate-700 mt-3">
                              Requesting <strong>{formatDuration(request.requested_seconds)}</strong> extra time
                            </p>
                            <p className="text-xs text-slate-600 mt-2">{request.reason}</p>
                          </div>
                          <div className="rounded-2xl bg-slate-100 px-3 py-2 text-center">
                            <p className="text-lg font-semibold text-slate-900">{quorum.passed}/3</p>
                            <p className="text-xs text-slate-500">passed</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Recent Decisions</h3>
              <div className="space-y-2">
                {resolvedRequests.slice(0, 5).map((request) => {
                  const device = devices.find((item) => item.id === request.device_id);
                  return (
                    <div key={request.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg text-sm">
                      <div>
                        <p className="font-medium text-slate-800">{device?.name ?? 'Unknown device'}</p>
                        <p className="text-xs text-slate-500">{formatDuration(request.requested_seconds)} requested</p>
                      </div>
                      <div className="text-right">
                        <p className={`text-xs font-semibold ${request.status === 'approved' ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {request.status}
                        </p>
                        <p className="text-xs text-slate-500">{request.resolved_at ? formatDateTime(request.resolved_at) : 'Pending'}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {selectedRequest && (
              <div className="bg-white border border-slate-200 rounded-xl p-4 sticky top-24">
                <h3 className="text-sm font-semibold text-slate-900 mb-4">Decision Panel</h3>

                <div className="space-y-4">
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-600 mb-1">Request Details</p>
                    <p className="text-sm font-medium text-slate-900">{formatDuration(selectedRequest.requested_seconds)} extra time</p>
                    <p className="text-xs text-slate-600 mt-2">{selectedRequest.reason}</p>
                  </div>

                  <div className="space-y-2">
                    {(['parent', 'policy', 'pattern'] as const).map((validator) => (
                      <div key={validator} className="border border-slate-200 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-medium text-slate-900 capitalize">{validator} check</p>
                          <div className="text-lg">
                            {selectedRequest.votes[validator] === true
                              ? 'Yes'
                              : selectedRequest.votes[validator] === false
                              ? 'No'
                              : 'Open'}
                          </div>
                        </div>
                        {selectedRequest.votes[validator] === null && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleVote(selectedRequest.id, validator, true)}
                              className="flex-1 px-3 py-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded text-xs font-medium transition-colors"
                            >
                              <Check className="w-3 h-3 inline mr-1" />
                              Approve
                            </button>
                            <button
                              onClick={() => handleVote(selectedRequest.id, validator, false)}
                              className="flex-1 px-3 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded text-xs font-medium transition-colors"
                            >
                              <X className="w-3 h-3 inline mr-1" />
                              Deny
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <div className="flex items-start gap-2">
                      <FileText className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-medium text-blue-900">Decision trace</p>
                        <p className="text-xs text-blue-700 mt-1 font-mono">Hash: {selectedRequest.id.slice(0, 12)}...</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
