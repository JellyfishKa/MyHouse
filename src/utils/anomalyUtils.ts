import type { AnomalyRecord } from '../api/hooks';

const SEVERITY_LABEL: Record<string, string> = {
  low: 'Низкий',
  medium: 'Средний',
  high: 'Высокий',
  critical: 'Критический',
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

export function inferAnomalyCause(record: AnomalyRecord): string {
  const cat = record.category.toLowerCase();
  const sev = record.severity;

  if (cat.includes('server')) {
    if (sev === 'critical') {
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
