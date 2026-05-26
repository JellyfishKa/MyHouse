import { STRESS_CYCLES, STRESS_S, type StressCycle } from '../constants/stressSteps';
import type { ObjectSensor } from '../api/hooks';

/** 30 календарных дней сжимаются в 15 минут на оси X. */
export const FORECAST_WINDOW_MS = 15 * 60_000;
export const FORECAST_BUCKET_MS = 10_000;
const FORECAST_DAYS = 30;

export interface ForecastScenarioEvent {
  id: string;
  cycle?: StressCycle;
  stepGate: number;
  stepDone?: number;
  category: string;
  pattern: 'spike' | 'drift' | 'plateau_high' | 'plateau_low' | 'oscillation' | 'critical_plateau';
  startDay: number;
  durationDays: number;
  magnitudePct: number;
  magnitudeSwing?: number;
  horizonDays: number;
  label: string;
}

export const FORECAST_SCENARIO: ForecastScenarioEvent[] = [
  {
    id: 'spike',
    cycle: STRESS_CYCLES[0],
    stepGate: STRESS_S.spike_predict,
    stepDone: STRESS_S.spike,
    category: 'servers',
    pattern: 'spike',
    startDay: 1.5,
    durationDays: 0.6,
    magnitudePct: 110,
    horizonDays: 7,
    label: 'Spike · серверы',
  },
  {
    id: 'drift',
    stepGate: STRESS_S.drift_predict,
    stepDone: STRESS_S.cooling_predict,
    category: 'servers',
    pattern: 'drift',
    startDay: 3,
    durationDays: 4,
    magnitudePct: 112,
    horizonDays: 7,
    label: 'Drift · серверы',
  },
  {
    id: 'cooling',
    cycle: STRESS_CYCLES[1],
    stepGate: STRESS_S.cooling_predict,
    stepDone: STRESS_S.cooling_plateau,
    category: 'cooling',
    pattern: 'plateau_high',
    startDay: 8,
    durationDays: 5,
    magnitudePct: 115,
    horizonDays: 7,
    label: 'Plateau ↑ · охлаждение',
  },
  {
    id: 'lighting',
    cycle: STRESS_CYCLES[2],
    stepGate: STRESS_S.lighting_predict,
    stepDone: STRESS_S.lighting_low,
    category: 'lighting',
    pattern: 'plateau_low',
    startDay: 14,
    durationDays: 8,
    magnitudePct: 72,
    horizonDays: 30,
    label: 'Under ↓ · освещение',
  },
  {
    id: 'ups',
    cycle: STRESS_CYCLES[3],
    stepGate: STRESS_S.ups_predict,
    stepDone: STRESS_S.ups_osc,
    category: 'ups',
    pattern: 'oscillation',
    startDay: 19,
    durationDays: 5,
    magnitudePct: 100,
    magnitudeSwing: 12,
    horizonDays: 7,
    label: 'Oscillation · ИБП',
  },
  {
    id: 'critical',
    cycle: STRESS_CYCLES[4],
    stepGate: STRESS_S.critical_predict,
    stepDone: STRESS_S.critical_plateau,
    category: 'servers',
    pattern: 'critical_plateau',
    startDay: 24,
    durationDays: 6,
    magnitudePct: 142,
    horizonDays: 30,
    label: 'Critical plateau · серверы',
  },
];

function eventActiveAtDay(event: ForecastScenarioEvent, day: number): boolean {
  return day >= event.startDay && day < event.startDay + event.durationDays;
}

function eventProgress(event: ForecastScenarioEvent, day: number): number {
  if (!eventActiveAtDay(event, day)) return 0;
  return (day - event.startDay) / event.durationDays;
}

function patternValue(event: ForecastScenarioEvent, day: number): number {
  if (!eventActiveAtDay(event, day)) return 100;
  const p = eventProgress(event, day);

  switch (event.pattern) {
    case 'spike': {
      const peak = Math.exp(-((p - 0.35) ** 2) / 0.08);
      return 100 + (event.magnitudePct - 100) * peak;
    }
    case 'drift':
      return 100 + (event.magnitudePct - 100) * p;
    case 'plateau_high':
    case 'plateau_low':
    case 'critical_plateau':
      return event.magnitudePct;
    case 'oscillation': {
      const swing = event.magnitudeSwing ?? 10;
      return 100 + swing * Math.sin(p * Math.PI * 6);
    }
    default:
      return 100;
  }
}

function sensorCategory(sensor: ObjectSensor): string {
  return sensor.category.toLowerCase();
}

function isEventFuture(event: ForecastScenarioEvent, stressStep: number): boolean {
  const done = event.stepDone ?? event.stepGate;
  return stressStep < done;
}

function isEventVisible(event: ForecastScenarioEvent, stressStep: number): boolean {
  return stressStep >= event.stepGate;
}

function normCategory(cat: string): string {
  return cat.toLowerCase();
}

export function computeForecastPct(
  category: string,
  forecastDay: number,
  stressStep: number,
): number {
  const cat = normCategory(category);
  let value = 100;
  for (const event of FORECAST_SCENARIO) {
    if (normCategory(event.category) !== cat) continue;
    if (!isEventVisible(event, stressStep)) continue;
    if (!isEventFuture(event, stressStep)) continue;
    if (!eventActiveAtDay(event, forecastDay)) continue;
    value = patternValue(event, forecastDay);
  }
  return Math.round(value * 10) / 10;
}

export interface ForecastZone {
  x1: string;
  x2: string;
  yLow: number;
  yHigh: number;
  fill: string;
  fillOpacity: number;
  label: string;
  detail: string;
}

export interface ForecastMarker {
  time: string;
  y: number;
  label: string;
  fill: string;
  detail: string;
}

type ChartRow = Record<string, number | string | null | boolean>;

function dayToIso(nowMs: number, day: number): string {
  const offsetMs = (day / FORECAST_DAYS) * FORECAST_WINDOW_MS;
  return new Date(nowMs + offsetMs).toISOString();
}

export function buildForecastExtension(
  sensors: ObjectSensor[],
  actualData: ChartRow[],
  stressStep: number,
): {
  rows: ChartRow[];
  nowTime: string | undefined;
  zones: ForecastZone[];
  markers: ForecastMarker[];
  upcoming: ForecastScenarioEvent[];
} {
  if (!actualData.length) {
    return { rows: [], nowTime: undefined, zones: [], markers: [], upcoming: [] };
  }

  const lastRow = actualData[actualData.length - 1];
  const nowMs = new Date(String(lastRow.time)).getTime();
  const nowTime = String(lastRow.time);
  const rows: ChartRow[] = [];
  const zones: ForecastZone[] = [];
  const markers: ForecastMarker[] = [];

  const upcoming = FORECAST_SCENARIO.filter(
    (e) => isEventVisible(e, stressStep) && isEventFuture(e, stressStep),
  );

  for (const event of upcoming) {
    const endDay = event.startDay + event.durationDays;
    const yCenter = event.pattern === 'oscillation'
      ? 100
      : event.magnitudePct;
    const yLow = event.pattern === 'oscillation'
      ? 100 - (event.magnitudeSwing ?? 12)
      : Math.min(100, yCenter) - (event.pattern === 'plateau_low' ? 0 : 3);
    const yHigh = event.pattern === 'oscillation'
      ? 100 + (event.magnitudeSwing ?? 12)
      : Math.max(100, yCenter) + 3;

    const fill = event.cycle?.fill ?? '#1677ff';
    const magLabel = event.pattern === 'oscillation'
      ? `±${event.magnitudeSwing ?? 12}%`
      : `${event.magnitudePct >= 100 ? '+' : ''}${(event.magnitudePct - 100).toFixed(0)}%`;

    zones.push({
      x1: dayToIso(nowMs, event.startDay),
      x2: dayToIso(nowMs, endDay),
      yLow,
      yHigh,
      fill,
      fillOpacity: 0.14,
      label: `${event.horizonDays}д · ${event.label}`,
      detail: `${magLabel} · ~${event.durationDays.toFixed(1)} сут`,
    });

    const peakDay = event.pattern === 'spike'
      ? event.startDay + event.durationDays * 0.35
      : event.startDay + event.durationDays / 2;
    markers.push({
      time: dayToIso(nowMs, peakDay),
      y: event.pattern === 'oscillation' ? 100 + (event.magnitudeSwing ?? 12) : event.magnitudePct,
      label: event.label,
      fill,
      detail: `${event.horizonDays} дн. · ${magLabel} · ${event.durationDays.toFixed(1)} сут`,
    });
  }

  const bridgeRow: ChartRow = { time: nowTime, __now: true };
  sensors.forEach((s) => {
    const v = lastRow[s.label];
    if (typeof v === 'number') {
      bridgeRow[s.label] = v;
      bridgeRow[`${s.label}__fc`] = v;
    }
  });
  rows.push(bridgeRow);

  const steps = Math.floor(FORECAST_WINDOW_MS / FORECAST_BUCKET_MS);
  for (let i = 1; i <= steps; i += 1) {
    const tMs = nowMs + i * FORECAST_BUCKET_MS;
    const forecastDay = (i * FORECAST_BUCKET_MS / FORECAST_WINDOW_MS) * FORECAST_DAYS;
    const row: ChartRow = { time: new Date(tMs).toISOString(), __forecast: true };
    sensors.forEach((sensor) => {
      row[sensor.label] = null;
      row[`${sensor.label}__fc`] = computeForecastPct(sensorCategory(sensor), forecastDay, stressStep);
    });
    rows.push(row);
  }

  return { rows, nowTime, zones, markers, upcoming };
}

export function mergeActualAndForecast(actualData: ChartRow[], forecastRows: ChartRow[]): ChartRow[] {
  if (!forecastRows.length) return actualData;
  const bridgeTime = forecastRows[0]?.time;
  const trimmed = actualData.filter((r) => String(r.time) !== String(bridgeTime));
  return [...trimmed, ...forecastRows];
}

export function formatForecastDuration(days: number): string {
  if (days < 1) return `${Math.round(days * 24)} ч`;
  if (days < 7) return `${days.toFixed(1)} сут`;
  return `${Math.round(days)} сут`;
}
