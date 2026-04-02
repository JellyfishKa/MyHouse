import { useQuery } from '@tanstack/react-query';
import api from './client';

// ID объекта по умолчанию (из seed.py)
const DEFAULT_OBJECT_ID = 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

export interface CategorySummary {
  category: string;
  kwh: number;
  cost_rub: number;
}

export interface AnomalyRecord {
  id: string;
  time: string;
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  value: number;
  expected: number | null;
}

export interface AggregatedReading {
  time: string;
  value: number | null;
}

export function useSummary(objectId: string = DEFAULT_OBJECT_ID) {
  return useQuery<CategorySummary[]>({
    queryKey: ['summary', objectId],
    queryFn: async () => {
      const { data } = await api.get(`/analytics/summary/${objectId}`);
      return data;
    },
  });
}

export function useAnomalies(objectId: string = DEFAULT_OBJECT_ID, severity?: string) {
  return useQuery<AnomalyRecord[]>({
    queryKey: ['anomalies', objectId, severity],
    queryFn: async () => {
      const params: Record<string, string> = { object_id: objectId };
      if (severity) params.severity = severity;
      const { data } = await api.get('/anomalies', { params });
      return data;
    },
  });
}

export function useTelemetry(
  sensorId: string,
  from: string,
  to: string,
  agg: 'raw' | 'hour' | 'day' = 'hour',
) {
  return useQuery<AggregatedReading[]>({
    queryKey: ['telemetry', sensorId, from, to, agg],
    queryFn: async () => {
      const { data } = await api.get(`/telemetry/${sensorId}`, {
        params: { from, to, agg },
      });
      return data;
    },
    enabled: !!sensorId,
  });
}
