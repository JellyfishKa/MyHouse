import type { SensorSummary } from '../api/hooks';

export function healthColor(grade?: string): string {
  if (grade === 'A') return '#2ecc72';
  if (grade === 'B') return '#f0a500';
  if (grade === 'C') return '#e67e22';
  return '#e74c3c';
}

export function rulColor(status?: string): string {
  if (status === 'ok') return '#2ecc72';
  if (status === 'warning') return '#f0a500';
  return '#e74c3c';
}

export function confidenceLabel(confidence?: string): string {
  if (confidence === 'high') return 'высокая';
  if (confidence === 'medium') return 'средняя';
  return 'низкая';
}

/** Среднее потребление по всем сенсорам (Вт). */
export function aggregateTotalAverage(summary: SensorSummary[]): { value: number | null; unit: string } {
  if (!summary.length) return { value: null, unit: 'Вт' };
  const total = summary.reduce((acc, s) => acc + s.average, 0);
  const unit = summary[0]?.unit ?? 'Вт';
  return { value: Math.round(total * 10) / 10, unit };
}

/** Среднее по категории — усреднение всех сенсоров категории. */
export function averageByCategory(summary: SensorSummary[], category: string): { avg: number; unit: string } | null {
  const items = summary.filter((s) => s.category === category);
  if (!items.length) return null;
  const avg = items.reduce((acc, s) => acc + s.average, 0) / items.length;
  return { avg: Math.round(avg * 10) / 10, unit: items[0].unit };
}

import type { QueryClient } from '@tanstack/react-query';

export async function invalidateObjectMetrics(queryClient: QueryClient, objectId: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['anomalies', objectId] }),
    queryClient.invalidateQueries({ queryKey: ['health-score', objectId] }),
    queryClient.invalidateQueries({ queryKey: ['rul', objectId] }),
    queryClient.invalidateQueries({ queryKey: ['summary', objectId] }),
    queryClient.invalidateQueries({ queryKey: ['predictive-insights', objectId] }),
  ]);
}
