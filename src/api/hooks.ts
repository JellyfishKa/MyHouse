import { useMutation, useQuery } from '@tanstack/react-query';
import api from './client';

export interface MonitoringObject {
  id: string;
  name: string;
  type: 'datacenter' | 'workshop' | 'building';
  meta_data?: Record<string, unknown> | null;
  sensor_count: number;
  reading_count: number;
  anomaly_count: number;
  last_reading_at?: string | null;
}

export interface ObjectSensor {
  id: string;
  label: string;
  category: string;
  unit: string;
  reading_count: number;
  last_reading_at?: string | null;
}

export interface SensorSummary {
  sensor_id: string;
  sensor_label: string;
  category: string;
  unit: string;
  average: number;
  minimum: number;
  maximum: number;
  readings_count: number;
}

export interface AnomalyRecord {
  id: string;
  time: string;
  category: string;
  sensor_label?: string | null;
  severity: 'low' | 'medium' | 'high' | 'critical';
  value: number;
  expected: number | null;
}

export interface AggregatedReading {
  time: string;
  value: number | null;
}

export interface MlHealth {
  status: string;
  service: string;
  detail?: string | null;
}

export interface DetectRequest {
  object_id?: string;
  sensor_id?: string;
  days?: number;
}

export interface DetectResponse {
  anomalies_found: number;
  anomalies_inserted: number;
}

export interface HealthScore {
  object_id: string;
  score: number;
  grade: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface RulPrediction {
  object_id: string;
  rul_days: number;
  status: 'ok' | 'warning' | 'critical';
  confidence: string;
}

export interface EquipmentItem {
  id: string;
  object_id: string;
  name: string;
  type: 'server' | 'conditioner' | 'ups' | 'switch';
  status: 'online' | 'offline' | 'maintenance';
  installed_at?: string | null;
  meta_data?: Record<string, unknown> | null;
}

export async function fetchTelemetry(
  sensorId: string,
  from: string,
  to: string,
  agg: 'raw' | 'hour' | 'day' = 'hour',
) {
  const { data } = await api.get<AggregatedReading[]>(`/telemetry/${sensorId}`, {
    params: { from, to, agg },
  });
  return data;
}

export function useObjects() {
  return useQuery<MonitoringObject[]>({
    queryKey: ['objects'],
    queryFn: async () => {
      const { data } = await api.get('/objects');
      return data;
    },
  });
}

export function useObjectSensors(objectId?: string) {
  return useQuery<ObjectSensor[]>({
    queryKey: ['object-sensors', objectId],
    queryFn: async () => {
      const { data } = await api.get(`/objects/${objectId!}/sensors`);
      return data;
    },
    enabled: !!objectId,
  });
}

export function useSummary(objectId?: string, refetchInterval?: number | false) {
  return useQuery<SensorSummary[]>({
    queryKey: ['summary', objectId],
    queryFn: async () => {
      const { data } = await api.get(`/analytics/summary/${objectId!}`);
      return data;
    },
    enabled: !!objectId,
    refetchInterval: refetchInterval ?? false,
  });
}

export function useAnomalies(objectId?: string, severity?: string) {
  return useQuery<AnomalyRecord[]>({
    queryKey: ['anomalies', objectId, severity],
    queryFn: async () => {
      const params: Record<string, string> = { object_id: objectId! };
      if (severity) params.severity = severity;
      const { data } = await api.get('/anomalies', { params });
      return data;
    },
    enabled: !!objectId,
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
    queryFn: () => fetchTelemetry(sensorId, from, to, agg),
    enabled: !!sensorId,
  });
}

export function useMlHealth() {
  return useQuery<MlHealth>({
    queryKey: ['ml-health'],
    queryFn: async () => {
      const { data } = await api.get('/ml/health');
      return data;
    },
    retry: false,
    refetchInterval: 30000,
  });
}

export function useHealthScore(objectId?: string, refetchInterval?: number | false) {
  return useQuery<HealthScore>({
    queryKey: ['health-score', objectId],
    queryFn: async () => {
      const { data } = await api.get(`/analytics/health/${objectId!}`);
      return data;
    },
    enabled: !!objectId,
    refetchInterval: refetchInterval ?? false,
  });
}

export function useRul(objectId?: string, refetchInterval?: number | false) {
  return useQuery<RulPrediction>({
    queryKey: ['rul', objectId],
    queryFn: async () => {
      const { data } = await api.get(`/analytics/rul/${objectId!}`);
      return data;
    },
    enabled: !!objectId,
    refetchInterval: refetchInterval ?? false,
  });
}

export function useEquipmentList(objectId?: string) {
  return useQuery<EquipmentItem[]>({
    queryKey: ['equipment', objectId],
    queryFn: async () => {
      const { data } = await api.get('/equipment', { params: { object_id: objectId! } });
      return data;
    },
    enabled: !!objectId,
  });
}

export interface StressTestRequest {
  object_id: string;
  equipment_id?: string;
  duration_seconds?: number;
}

export interface StressTestResponse {
  status: string;
  equipment_id: string;
  duration_seconds: number;
}

export function useStressTest() {
  return useMutation<StressTestResponse, Error, StressTestRequest>({
    mutationFn: async (payload) => {
      const { data } = await api.post('/demo/stress-test', payload);
      return data;
    },
  });
}

export function useTriggerDetection() {
  return useMutation<DetectResponse, Error, DetectRequest>({
    mutationFn: async (payload) => {
      const { data } = await api.post('/ml/detect', payload);
      return data;
    },
  });
}
