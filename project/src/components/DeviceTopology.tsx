import { useEffect, useRef, useState } from 'react';
import { Device, DeviceRelationship, Budget } from '../lib/supabase';
import { formatDuration, getUsagePercentage } from '../lib/utils';
import { Network, Info } from 'lucide-react';

interface Props {
  devices: Device[];
  relationships: DeviceRelationship[];
  budgets: Budget[];
}

interface Node {
  id: string;
  x: number;
  y: number;
  device: Device;
  budget?: Budget;
}

export default function DeviceTopology({ devices, relationships, budgets }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredNode, setHoveredNode] = useState<Node | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);

  useEffect(() => {
    const centerX = 400;
    const centerY = 300;
    const radius = 150;

    const newNodes: Node[] = devices.map((device, i) => {
      const angle = (i / devices.length) * 2 * Math.PI;
      return {
        id: device.id,
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
        device,
        budget: budgets.find(b => b.device_id === device.id),
      };
    });

    setNodes(newNodes);
  }, [devices, budgets]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    relationships.forEach(rel => {
      const nodeA = nodes.find(n => n.id === rel.device_a_id);
      const nodeB = nodes.find(n => n.id === rel.device_b_id);

      if (nodeA && nodeB) {
        ctx.beginPath();
        ctx.moveTo(nodeA.x, nodeA.y);
        ctx.lineTo(nodeB.x, nodeB.y);
        ctx.strokeStyle = `rgba(20, 184, 166, ${rel.weight})`;
        ctx.lineWidth = rel.weight * 4;
        ctx.stroke();

        const midX = (nodeA.x + nodeB.x) / 2;
        const midY = (nodeA.y + nodeB.y) / 2;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
        ctx.font = '10px sans-serif';
        ctx.fillText(rel.relationship_type.replace('_', ' '), midX, midY);
      }
    });

    nodes.forEach(node => {
      const percent = node.budget
        ? getUsagePercentage(node.budget.used_seconds, node.budget.total_budget_seconds)
        : 0;

      ctx.beginPath();
      ctx.arc(node.x, node.y, 40, 0, 2 * Math.PI);
      ctx.fillStyle = percent < 70 ? '#10b981' : percent < 90 ? '#f59e0b' : '#ef4444';
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const icon = node.device.type === 'laptop' ? '💻' : '📱';
      ctx.fillText(icon, node.x, node.y);

      if (node.device.is_online) {
        ctx.beginPath();
        ctx.arc(node.x + 25, node.y - 25, 6, 0, 2 * Math.PI);
        ctx.fillStyle = '#10b981';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });
  }, [nodes, relationships]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const hovered = nodes.find(node => {
      const dx = node.x - x;
      const dy = node.y - y;
      return Math.sqrt(dx * dx + dy * dy) < 40;
    });

    setHoveredNode(hovered || null);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-slate-200">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
            <Network className="w-5 h-5 text-teal-600" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Topology-Aware Device Graph (TADG)</h2>
            <p className="text-sm text-slate-600">Real-time device relationships and budget flow visualization</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="relative bg-slate-50 rounded-xl overflow-hidden border border-slate-200">
              <canvas
                ref={canvasRef}
                width={800}
                height={600}
                className="w-full"
                onMouseMove={handleMouseMove}
                onMouseLeave={() => setHoveredNode(null)}
              />

              {hoveredNode && (
                <div className="absolute top-4 left-4 bg-white rounded-lg shadow-lg border border-slate-200 p-4 max-w-xs">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">{hoveredNode.device.type === 'laptop' ? '💻' : '📱'}</span>
                    <div>
                      <p className="font-semibold text-slate-900">{hoveredNode.device.name}</p>
                      <p className="text-xs text-slate-500 capitalize">{hoveredNode.device.type}</p>
                    </div>
                  </div>
                  {hoveredNode.budget && (
                    <div className="text-sm space-y-1">
                      <div className="flex justify-between">
                        <span className="text-slate-600">Used:</span>
                        <span className="font-medium">{formatDuration(hoveredNode.budget.used_seconds)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Budget:</span>
                        <span className="font-medium">{formatDuration(hoveredNode.budget.total_budget_seconds)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Predicted:</span>
                        <span className="font-medium">{formatDuration(hoveredNode.budget.predicted_usage_seconds || 0)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Priority:</span>
                        <span className="font-medium">{hoveredNode.device.priority}/10</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <div className="flex items-start gap-2">
                <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-blue-900 mb-1">How TADG Works</h3>
                  <p className="text-xs text-blue-800 leading-relaxed">
                    The graph shows device relationships where edge thickness represents connection strength.
                    Budget flows through weighted edges based on device priority and usage patterns.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Relationships</h3>
              <div className="space-y-2">
                {relationships.slice(0, 5).map(rel => {
                  const deviceA = devices.find(d => d.id === rel.device_a_id);
                  const deviceB = devices.find(d => d.id === rel.device_b_id);
                  return (
                    <div key={rel.id} className="flex items-center justify-between text-xs">
                      <div className="flex-1 truncate">
                        <span className="text-slate-600">{deviceA?.name}</span>
                        <span className="text-slate-400 mx-1">↔</span>
                        <span className="text-slate-600">{deviceB?.name}</span>
                      </div>
                      <div className="ml-2">
                        <div className="w-16 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="h-full bg-teal-500 rounded-full"
                            style={{ width: `${rel.weight * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Legend</h3>
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-emerald-500" />
                  <span className="text-slate-600">&lt; 70% budget used</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-amber-500" />
                  <span className="text-slate-600">70-90% budget used</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-rose-500" />
                  <span className="text-slate-600">&gt; 90% budget used</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
