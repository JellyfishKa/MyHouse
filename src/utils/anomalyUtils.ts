import type { AnomalyRecord } from '../api/hooks';

const SEVERITY_LABEL: Record<string, string> = {
  low: 'Низкий',
  medium: 'Средний',
  high: 'Высокий',
  critical: 'Критический',
};

export type AnomalyPattern =
  | 'spike'
  | 'drift'
  | 'plateau_high'
  | 'plateau_low'
  | 'oscillation'
  | 'critical_plateau'
  | 'unknown';

const PATTERN_LABEL: Record<AnomalyPattern, string> = {
  spike: 'Spike — скачок',
  drift: 'Drift — восходящий тренд',
  plateau_high: 'Plateau ↑ — устойчиво повышенное',
  plateau_low: 'Underconsumption ↓ — устойчиво пониженное',
  oscillation: 'Oscillation — колебания',
  critical_plateau: 'Critical plateau — критически высокое',
  unknown: 'Отклонение от нормы',
};

const PATTERN_COLOR: Record<AnomalyPattern, string> = {
  spike: 'orange',
  drift: 'blue',
  plateau_high: 'volcano',
  plateau_low: 'cyan',
  oscillation: 'purple',
  critical_plateau: 'red',
  unknown: 'default',
};

export function formatAnomalyDeviation(record: AnomalyRecord) {
  if (record.expected == null || record.expected === 0) {
    return { text: '—', color: undefined, pct: null as number | null };
  }

  const raw = ((record.value - record.expected) / Math.abs(record.expected)) * 100;
  const capped = Math.max(-99.9, Math.min(99.9, raw));
  const sign = capped >= 0 ? '+' : '';
  const abs = Math.abs(capped);

  let color = '#52c41a';
  if (abs >= 30) color = '#ff4d4f';
  else if (abs >= 15) color = '#fa8c16';
  else if (abs >= 8) color = '#faad14';

  return { text: `${sign}${capped.toFixed(1)}%`, color, pct: capped };
}

export function inferAnomalyPattern(record: AnomalyRecord): AnomalyPattern {
  const { pct } = formatAnomalyDeviation(record);
  if (pct == null) return 'unknown';

  if (pct <= -18) return 'plateau_low';
  if (pct >= 35) return 'critical_plateau';
  if (pct >= 18) return 'plateau_high';
  if (pct >= 10 && record.severity === 'low') return 'spike';
  if (pct >= 8 && record.severity === 'high') return 'oscillation';
  if (pct >= 5 && pct < 15 && record.severity === 'low') return 'drift';

  if (pct >= 12) return 'plateau_high';
  if (pct <= -12) return 'plateau_low';
  return 'unknown';
}

export function anomalyPatternLabel(pattern: AnomalyPattern) {
  return PATTERN_LABEL[pattern];
}

export function anomalyPatternColor(pattern: AnomalyPattern) {
  return PATTERN_COLOR[pattern];
}

export function inferAnomalyCause(record: AnomalyRecord): string {
  const pattern = inferAnomalyPattern(record);
  const cat = record.category.toLowerCase();

  if (pattern === 'spike') {
    return 'Кратковременный скачок (spike): резкий импульс нагрузки — типичен для batch-задач, включения узлов или краткого перегрева.';
  }
  if (pattern === 'drift') {
    return 'Восходящий тренд (drift): потребление растёт постепенно — возможна деградация оборудования, утечка нагрузки или неконтролируемое масштабирование.';
  }
  if (pattern === 'plateau_high') {
    return 'Устойчиво повышенное потребление (plateau ↑): нагрузка держится выше нормы — проверьте режим работы и охлаждение.';
  }
  if (pattern === 'plateau_low') {
    return 'Устойчиво пониженное потребление (underconsumption ↓): линия работает ниже нормы — возможен отказ группы нагрузки, ошибка датчика или несанкционированное отключение.';
  }
  if (pattern === 'oscillation') {
    return 'Колебания (oscillation): нестабильная нагрузка с периодическими пиками — характерно для ИБП, компрессоров или осциллирующего терморегулирования.';
  }
  if (pattern === 'critical_plateau') {
    return 'Критический plateau: длительное повышенное потребление на опасном уровне — требуется немедленная проверка.';
  }

  if (cat.includes('server')) {
    if (record.severity === 'critical') {
      return 'Вероятная перегрузка серверной стойки или отказ системы охлаждения — резкий рост потребления на линии серверов.';
    }
    return 'Рост нагрузки на серверном оборудовании: batch-задачи, пик CPU или включение дополнительных узлов.';
  }
  if (cat.includes('cool')) {
    return 'Повышенная нагрузка на контур охлаждения — возможен рост температуры в зале или снижение КПД кондиционеров.';
  }
  if (cat.includes('ups') || cat.includes('ибп')) {
    return 'Нестабильность на линии ИБП — возможны скачки нагрузки или переход на резервное питание.';
  }
  if (cat.includes('light')) {
    return 'Отклонение на линии освещения — неконтролируемое включение групп или ошибка датчика.';
  }
  return 'Отклонение от расчётной нормы — требуется проверка оборудования и истории потребления.';
}

export function anomalySeverityLabel(severity: string) {
  return SEVERITY_LABEL[severity] ?? severity;
}
