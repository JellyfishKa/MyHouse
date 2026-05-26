import {
  STRESS_S,
  STRESS_CYCLES,
  STRESS_TICK_SEC,
  STRESS_TOTAL_STEPS,
  SIM_DAYS,
  stepToSimDay,
  type StressCycle,
} from '../constants/stressSteps';
import type { ObjectSensor } from '../api/hooks';

export { SIM_DAYS, stepToSimDay };

export interface ForecastScenarioEvent {
  id: string;
  cycle?: StressCycle;
  predictStep: number;
  precursorStep?: number;
  confirmStep: number;
  category: string;
  pattern: 'spike' | 'drift' | 'plateau_high' | 'plateau_low' | 'oscillation' | 'critical_plateau';
  magnitudePct: number;
  magnitudeSwing?: number;
  horizonDays: number;
  label: string;
  /** Ширина зоны на оси «дней» после confirm. */
  impactDays: number;
}

/** События привязаны к шагам стресса → равномерно по 30 симулированным суткам. */
export const FORECAST_SCENARIO: ForecastScenarioEvent[] = [
  {
    id: 'spike',
    cycle: STRESS_CYCLES[0],
    predictStep: STRESS_S.spike_predict,
    precursorStep: STRESS_S.spike_precursor,
    confirmStep: STRESS_S.spike,
    category: 'servers',
    pattern: 'spike',
    magnitudePct: 110,
    horizonDays: 7,
    label: 'Spike · серверы',
    impactDays: 0.8,
  },
  {
    id: 'drift',
    predictStep: STRESS_S.drift_predict,
    confirmStep: STRESS_S.cooling_predict,
    category: 'servers',
    pattern: 'drift',
    magnitudePct: 112,
    horizonDays: 7,
    label: 'Drift · серверы',
    impactDays: 1.2,
  },
  {
    id: 'cooling',
    cycle: STRESS_CYCLES[1],
    predictStep: STRESS_S.cooling_predict,
    precursorStep: STRESS_S.cooling_precursor,
    confirmStep: STRESS_S.cooling_plateau,
    category: 'cooling',
    pattern: 'plateau_high',
    magnitudePct: 115,
    horizonDays: 7,
    label: 'Plateau ↑ · охлаждение',
    impactDays: 1.5,
  },
  {
    id: 'lighting',
    cycle: STRESS_CYCLES[2],
    predictStep: STRESS_S.lighting_predict,
    precursorStep: STRESS_S.lighting_precursor,
    confirmStep: STRESS_S.lighting_low,
    category: 'lighting',
    pattern: 'plateau_low',
    magnitudePct: 72,
    horizonDays: 30,
    label: 'Under ↓ · освещение',
    impactDays: 2,
  },
  {
    id: 'ups',
    cycle: STRESS_CYCLES[3],
    predictStep: STRESS_S.ups_predict,
    precursorStep: STRESS_S.ups_precursor,
    confirmStep: STRESS_S.ups_osc,
    category: 'ups',
    pattern: 'oscillation',
    magnitudePct: 100,
    magnitudeSwing: 12,
    horizonDays: 7,
    label: 'Oscillation · ИБП',
    impactDays: 1.2,
  },
  {
    id: 'critical',
    cycle: STRESS_CYCLES[4],
    predictStep: STRESS_S.critical_predict,
    precursorStep: STRESS_S.critical_precursor,
    confirmStep: STRESS_S.critical_plateau,
    category: 'servers',
    pattern: 'critical_plateau',
    magnitudePct: 142,
    horizonDays: 30,
    label: 'Critical · серверы',
    impactDays: 2,
  },
];

function normCategory(cat: string): string {
  return cat.toLowerCase();
}

function eventSimRange(event: ForecastScenarioEvent) {
  const startDay = stepToSimDay(event.predictStep);
  const confirmDay = stepToSimDay(event.confirmStep);
  const endDay = confirmDay + event.impactDays;
  return { startDay, precursorDay: event.precursorStep ? stepToSimDay(event.precursorStep) : null, confirmDay, endDay };
}

function isEventFuture(event: ForecastScenarioEvent, stressStep: number): boolean {
  return stressStep < event.confirmStep;
}

function isEventVisible(event: ForecastScenarioEvent, stressStep: number): boolean {
  return stressStep >= event.predictStep;
}

function eventActiveAtDay(event: ForecastScenarioEvent, day: number): boolean {
  const { startDay, endDay } = eventSimRange(event);
  return day >= startDay && day < endDay;
}

function eventProgress(event: ForecastScenarioEvent, day: number): number {
  const { startDay, confirmDay } = eventSimRange(event);
  if (day < startDay || day >= confirmDay + event.impactDays) return 0;
  if (day <= confirmDay) {
    return (day - startDay) / Math.max(0.01, confirmDay - startDay);
  }
  return 1;
}

function patternValue(event: ForecastScenarioEvent, day: number): number {
  const { confirmDay } = eventSimRange(event);
  if (day < eventSimRange(event).startDay) return 100;

  if (event.pattern === 'spike' && day <= confirmDay) {
    const { startDay } = eventSimRange(event);
    const p = (day - startDay) / Math.max(0.01, confirmDay - startDay);
    const peak = Math.exp(-((p - 0.85) ** 2) / 0.06);
    return 100 + (event.magnitudePct - 100) * peak * 0.6;
  }

  if (day >= confirmDay) {
    switch (event.pattern) {
      case 'spike':
        return event.magnitudePct;
      case 'drift':
        return 100 + (event.magnitudePct - 100) * Math.min(1, (day - confirmDay) / event.impactDays);
      case 'plateau_high':
      case 'plateau_low':
      case 'critical_plateau':
        return event.magnitudePct;
      case 'oscillation': {
        const swing = event.magnitudeSwing ?? 12;
        const p = (day - confirmDay) / event.impactDays;
        return 100 + swing * Math.sin(p * Math.PI * 4);
      }
      default:
        return 100;
    }
  }

  if (event.pattern === 'drift') {
    const p = eventProgress(event, day);
    return 100 + (event.magnitudePct - 100) * p * 0.5;
  }

  return 100 + (event.magnitudePct - 100) * 0.15;
}

export function computeForecastPct(
  category: string,
  simDay: number,
  stressStep: number,
): number {
  const cat = normCategory(category);
  let value = 100;
  for (const event of FORECAST_SCENARIO) {
    if (normCategory(event.category) !== cat) continue;
    if (!isEventVisible(event, stressStep)) continue;
    if (!isEventFuture(event, stressStep)) continue;
    if (!eventActiveAtDay(event, simDay)) continue;
    value = patternValue(event, simDay);
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
  phase: 'predict' | 'precursor' | 'impact';
}

export interface ForecastMarker {
  time: string;
  y: number;
  label: string;
  fill: string;
  detail: string;
}

export interface ForecastMeta {
  currentSimDay: number;
  remainingSimDays: number;
  remainingStressMs: number;
  nowMs: number;
}

type ChartRow = Record<string, number | string | null | boolean>;

function simDayToTimestamp(
  nowMs: number,
  targetDay: number,
  currentSimDay: number,
  remainingStressMs: number,
  remainingSimDays: number,
): number {
  if (remainingSimDays <= 0.01) return nowMs;
  const offset = targetDay - currentSimDay;
  if (offset <= 0) return nowMs;
  return nowMs + (offset / remainingSimDays) * remainingStressMs;
}

function dayToIso(
  nowMs: number,
  day: number,
  meta: ForecastMeta,
): string {
  return new Date(simDayToTimestamp(nowMs, day, meta.currentSimDay, meta.remainingStressMs, meta.remainingSimDays)).toISOString();
}

export function buildForecastMeta(stressStep: number): ForecastMeta {
  const currentSimDay = stepToSimDay(stressStep);
  const remainingSteps = Math.max(0, STRESS_TOTAL_STEPS - stressStep);
  return {
    currentSimDay,
    remainingSimDays: Math.max(0.01, SIM_DAYS - currentSimDay),
    remainingStressMs: remainingSteps * STRESS_TICK_SEC * 1000,
    nowMs: 0,
  };
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
  meta: ForecastMeta | null;
} {
  if (!actualData.length) {
    return { rows: [], nowTime: undefined, zones: [], markers: [], upcoming: [], meta: null };
  }

  const lastRow = actualData[actualData.length - 1];
  const nowMs = new Date(String(lastRow.time)).getTime();
  const nowTime = String(lastRow.time);
  const meta = buildForecastMeta(stressStep);
  meta.nowMs = nowMs;

  const rows: ChartRow[] = [];
  const zones: ForecastZone[] = [];
  const markers: ForecastMarker[] = [];

  const upcoming = FORECAST_SCENARIO.filter(
    (e) => isEventVisible(e, stressStep) && isEventFuture(e, stressStep),
  );

  for (const event of upcoming) {
    const { startDay, precursorDay, confirmDay, endDay } = eventSimRange(event);
    const fill = event.cycle?.fill ?? '#1677ff';
    const magLabel = event.pattern === 'oscillation'
      ? `±${event.magnitudeSwing ?? 12}%`
      : `${event.magnitudePct >= 100 ? '+' : ''}${(event.magnitudePct - 100).toFixed(0)}%`;

    const yLow = event.pattern === 'oscillation'
      ? 100 - (event.magnitudeSwing ?? 12)
      : Math.min(100, event.magnitudePct) - 3;
    const yHigh = event.pattern === 'oscillation'
      ? 100 + (event.magnitudeSwing ?? 12)
      : Math.max(100, event.magnitudePct) + 3;

    const visibleStart = Math.max(meta.currentSimDay, startDay);

    if (precursorDay != null && meta.currentSimDay < precursorDay) {
      zones.push({
        x1: dayToIso(nowMs, visibleStart, meta),
        x2: dayToIso(nowMs, Math.min(precursorDay, confirmDay), meta),
        yLow: 98,
        yHigh: 102,
        fill,
        fillOpacity: 0.2,
        label: `Прогноз ${event.horizonDays}д`,
        detail: event.label,
        phase: 'predict',
      });
    }

    if (precursorDay != null && meta.currentSimDay < confirmDay) {
      zones.push({
        x1: dayToIso(nowMs, Math.max(meta.currentSimDay, precursorDay), meta),
        x2: dayToIso(nowMs, confirmDay, meta),
        yLow,
        yHigh,
        fill,
        fillOpacity: 0.28,
        label: 'Сигнал 2д',
        detail: `${magLabel}`,
        phase: 'precursor',
      });
    } else if (!precursorDay && meta.currentSimDay < confirmDay) {
      zones.push({
        x1: dayToIso(nowMs, visibleStart, meta),
        x2: dayToIso(nowMs, confirmDay, meta),
        yLow,
        yHigh,
        fill,
        fillOpacity: 0.22,
        label: `Прогноз ${event.horizonDays}д`,
        detail: event.label,
        phase: 'predict',
      });
    }

    zones.push({
      x1: dayToIso(nowMs, Math.max(meta.currentSimDay, confirmDay), meta),
      x2: dayToIso(nowMs, endDay, meta),
      yLow,
      yHigh,
      fill,
      fillOpacity: 0.35,
      label: magLabel,
      detail: `${event.impactDays.toFixed(1)} сут`,
      phase: 'impact',
    });

    markers.push({
      time: dayToIso(nowMs, confirmDay, meta),
      y: event.pattern === 'oscillation' ? 100 + (event.magnitudeSwing ?? 12) : event.magnitudePct,
      label: `Д${confirmDay.toFixed(1)}`,
      fill,
      detail: `${event.label} · ${magLabel} · ${event.impactDays.toFixed(1)} сут`,
    });
  }

  const bridgeRow: ChartRow = { time: nowTime, __now: true, __simDay: meta.currentSimDay };
  sensors.forEach((s) => {
    const v = lastRow[s.label];
    if (typeof v === 'number') {
      bridgeRow[s.label] = v;
      bridgeRow[`${s.label}__fc`] = v;
    }
  });
  rows.push(bridgeRow);

  const remainingSteps = Math.max(1, STRESS_TOTAL_STEPS - stressStep);
  for (let i = 1; i <= remainingSteps; i += 1) {
    const tMs = nowMs + i * STRESS_TICK_SEC * 1000;
    const simDay = meta.currentSimDay + (i / remainingSteps) * meta.remainingSimDays;
    const row: ChartRow = { time: new Date(tMs).toISOString(), __forecast: true, __simDay: Math.round(simDay * 10) / 10 };
    sensors.forEach((sensor) => {
      row[sensor.label] = null;
      row[`${sensor.label}__fc`] = computeForecastPct(normCategory(sensor.category), simDay, stressStep);
    });
    rows.push(row);
  }

  return { rows, nowTime, zones, markers, upcoming, meta };
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

export function formatSimDayLabel(day: number): string {
  return `День ${day.toFixed(1)}`;
}

export function eventDayRangeLabel(event: ForecastScenarioEvent): string {
  const { startDay, confirmDay, endDay } = eventSimRange(event);
  return `Д${startDay.toFixed(1)}→${endDay.toFixed(1)} (пик Д${confirmDay.toFixed(1)})`;
}
