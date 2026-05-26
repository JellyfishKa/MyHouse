/** Mirrors backend demo.py step thresholds (1 step = 2 s). */
export const STRESS_TICK_SEC = 2;
export const STRESS_DURATION_SEC = 180;
export const STRESS_TOTAL_STEPS = STRESS_DURATION_SEC / STRESS_TICK_SEC; // 90
/** За 3 мин стресс-теста «проходит» 30 симулированных суток. */
export const SIM_DAYS = 30;
export const SEED_DAYS_DEFAULT = 45;

export function stepToSimDay(step: number): number {
  return (step / STRESS_TOTAL_STEPS) * SIM_DAYS;
}

export function simDayToStep(day: number): number {
  return (day / SIM_DAYS) * STRESS_TOTAL_STEPS;
}

export const STRESS_S = {
  spike_predict: 1,
  spike_precursor: 5,
  spike: 9,
  drift_predict: 10,
  cooling_predict: 13,
  cooling_precursor: 16,
  cooling_plateau: 18,
  lighting_predict: 21,
  lighting_precursor: 26,
  lighting_low: 29,
  ups_predict: 31,
  ups_precursor: 34,
  ups_osc: 36,
  critical_predict: 45,
  critical_precursor: 49,
  critical_plateau: 53,
  finale: 54,
} as const;

export interface StressCycle {
  predict: number;
  precursor?: number;
  anomaly: number;
  fill: string;
  label: string;
}

export const STRESS_CYCLES: StressCycle[] = [
  { predict: STRESS_S.spike_predict, precursor: STRESS_S.spike_precursor, anomaly: STRESS_S.spike, fill: '#1677ff', label: 'Spike' },
  { predict: STRESS_S.cooling_predict, precursor: STRESS_S.cooling_precursor, anomaly: STRESS_S.cooling_plateau, fill: '#13c2c2', label: 'Plateau ↑' },
  { predict: STRESS_S.lighting_predict, precursor: STRESS_S.lighting_precursor, anomaly: STRESS_S.lighting_low, fill: '#722ed1', label: 'Under ↓' },
  { predict: STRESS_S.ups_predict, precursor: STRESS_S.ups_precursor, anomaly: STRESS_S.ups_osc, fill: '#fa8c16', label: 'Oscillation' },
  { predict: STRESS_S.critical_predict, precursor: STRESS_S.critical_precursor, anomaly: STRESS_S.critical_plateau, fill: '#ff4d4f', label: 'Critical' },
];

export function stepToTimeIso(stressStartedAt: number, step: number): string {
  return new Date(stressStartedAt + step * STRESS_TICK_SEC * 1000).toISOString();
}

export interface StressBand {
  x1: string;
  x2: string;
  fill: string;
  fillOpacity: number;
  label: string;
}

export function computeStressBands(stressStartedAt: number, currentStep: number): StressBand[] {
  const bands: StressBand[] = [];

  for (const cycle of STRESS_CYCLES) {
    if (currentStep < cycle.predict) continue;

    const predictEnd = cycle.precursor != null ? cycle.precursor : cycle.anomaly;
    if (currentStep >= cycle.predict && currentStep < predictEnd) {
      bands.push({
        x1: stepToTimeIso(stressStartedAt, cycle.predict),
        x2: stepToTimeIso(stressStartedAt, Math.min(currentStep + 1, predictEnd)),
        fill: cycle.fill,
        fillOpacity: 0.07,
        label: `7д · ${cycle.label}`,
      });
    }

    if (cycle.precursor != null && currentStep >= cycle.precursor && currentStep < cycle.anomaly) {
      bands.push({
        x1: stepToTimeIso(stressStartedAt, cycle.precursor),
        x2: stepToTimeIso(stressStartedAt, Math.min(currentStep + 1, cycle.anomaly)),
        fill: cycle.fill,
        fillOpacity: 0.12,
        label: `2д · ${cycle.label}`,
      });
    }

    if (currentStep >= cycle.anomaly) {
      bands.push({
        x1: stepToTimeIso(stressStartedAt, cycle.anomaly),
        x2: stepToTimeIso(stressStartedAt, currentStep + 1),
        fill: cycle.fill,
        fillOpacity: 0.09,
        label: `✓ ${cycle.label}`,
      });
    }
  }

  return bands;
}

export interface StressSignalInfo {
  tag: string;
  color: string;
}

export function computeStressSignal(step: number): StressSignalInfo | null {
  if (step >= STRESS_S.critical_precursor) return { tag: 'Сигнал 2д · critical', color: '#ff4d4f' };
  if (step >= STRESS_S.critical_predict) return { tag: 'Прогноз 30д · critical', color: '#ff7875' };
  if (step >= STRESS_S.ups_precursor) return { tag: 'Сигнал 2д · oscillation', color: '#fa8c16' };
  if (step >= STRESS_S.ups_predict) return { tag: 'Прогноз 7д · oscillation', color: '#ffa940' };
  if (step >= STRESS_S.lighting_precursor) return { tag: 'Сигнал 7д · under ↓', color: '#722ed1' };
  if (step >= STRESS_S.lighting_predict) return { tag: 'Прогноз 30д · under ↓', color: '#9254de' };
  if (step >= STRESS_S.cooling_precursor) return { tag: 'Сигнал 2д · plateau ↑', color: '#13c2c2' };
  if (step >= STRESS_S.cooling_predict) return { tag: 'Прогноз 7д · plateau ↑', color: '#36cfc9' };
  if (step >= STRESS_S.drift_predict) return { tag: 'Прогноз 7д · drift', color: '#2563eb' };
  if (step >= STRESS_S.spike_precursor) return { tag: 'Сигнал 2д · spike', color: '#1677ff' };
  if (step >= STRESS_S.spike_predict) return { tag: 'Прогноз 7д · spike', color: '#4096ff' };
  return null;
}
