export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export function formatTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getUsagePercentage(used: number, total: number): number {
  if (total === 0) return 0;
  return Math.min(100, (used / total) * 100);
}

export function getRiskLevel(percentage: number): 'low' | 'medium' | 'high' {
  if (percentage < 70) return 'low';
  if (percentage < 90) return 'medium';
  return 'high';
}

export function getRiskColor(level: 'low' | 'medium' | 'high'): string {
  switch (level) {
    case 'low':
      return 'text-emerald-600';
    case 'medium':
      return 'text-amber-600';
    case 'high':
      return 'text-rose-600';
  }
}

export function getBudgetColor(percentage: number): string {
  if (percentage < 70) return 'stroke-emerald-500';
  if (percentage < 90) return 'stroke-amber-500';
  return 'stroke-rose-500';
}

export function getCategoryColor(category: string): string {
  const colors: Record<string, string> = {
    productivity: 'bg-blue-100 text-blue-700',
    social: 'bg-purple-100 text-purple-700',
    entertainment: 'bg-pink-100 text-pink-700',
    learning: 'bg-green-100 text-green-700',
    gaming: 'bg-red-100 text-red-700',
    communication: 'bg-indigo-100 text-indigo-700',
    other: 'bg-gray-100 text-gray-700',
  };
  return colors[category] || colors.other;
}

export function getDeviceIcon(type: string): string {
  const icons: Record<string, string> = {
    phone: '📱',
    tablet: '📱',
    laptop: '💻',
  };
  return icons[type] || '📱';
}

export function calculateQuorumStatus(votes: {
  parent: boolean | null;
  policy: boolean | null;
  pattern: boolean | null;
}): { passed: number; total: number; approved: boolean } {
  const results = [votes.parent, votes.policy, votes.pattern];
  const completed = results.filter(v => v !== null).length;
  const passed = results.filter(v => v === true).length;

  return {
    passed,
    total: completed,
    approved: passed >= 2,
  };
}

export function generateMockPrediction(currentUsage: number, baselineAverage: number): number[] {
  const predictions = [];
  let current = currentUsage;

  for (let i = 0; i < 12; i++) {
    const hour = new Date().getHours() + Math.floor(i / 6);
    const timeMultiplier = hour >= 16 && hour <= 21 ? 1.5 : 0.8;
    const randomVariance = 0.9 + Math.random() * 0.2;
    const predicted = (baselineAverage / 24) * timeMultiplier * randomVariance;
    current += predicted;
    predictions.push(Math.round(current));
  }

  return predictions;
}

export function aggregateUsageByCategory(events: Array<{ app_category: string; duration_seconds: number }>) {
  const categoryTotals: Record<string, number> = {};

  events.forEach(event => {
    categoryTotals[event.app_category] = (categoryTotals[event.app_category] || 0) + event.duration_seconds;
  });

  return Object.entries(categoryTotals)
    .map(([category, seconds]) => ({ category, seconds }))
    .sort((a, b) => b.seconds - a.seconds);
}
