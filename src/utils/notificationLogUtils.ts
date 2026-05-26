import type { AlertRecord, AnomalyRecord } from '../api/hooks';
import {
  anomalyPatternLabel,
  formatAnomalyDeviation,
  inferAnomalyCause,
  inferAnomalyPattern,
} from './anomalyUtils';

export type NotificationLogKind = 'predict' | 'precursor' | 'confirmed' | 'info';

export interface NotificationLogEntry {
  id: string;
  kind: NotificationLogKind;
  title: string;
  summary: string;
  detail: string;
  horizonDays?: number;
  pattern?: string;
  severity?: string;
  timestamp: number;
  source: 'alert' | 'anomaly';
  sourceId: string;
  category?: string;
  valueLabel?: string;
}

const SEVERITY_LABEL: Record<string, string> = {
  low: 'Низкий',
  medium: 'Средний',
  high: 'Высокий',
  critical: 'Критический',
};

export function classifyAlertKind(alert: AlertRecord): NotificationLogKind {
  const msg = alert.message.toLowerCase();
  if (msg.startsWith('прогноз ·')) return 'predict';
  if (msg.startsWith('сигнал ·')) return 'precursor';
  return 'info';
}

export function alertLogTitle(alert: AlertRecord, kind: NotificationLogKind): string {
  if (kind === 'predict') {
    const m = alert.message.match(/прогноз · (\d+) дн\./i);
    return m ? `Прогноз · ${m[1]} дн.` : 'Прогноз ML';
  }
  if (kind === 'precursor') {
    const m = alert.message.match(/сигнал · (\d+) дн\./i);
    return m ? `Сигнал · ${m[1]} дн.` : 'Сигнал ML';
  }
  return `Оповещение · ${SEVERITY_LABEL[alert.severity] ?? alert.severity}`;
}

function parseHorizon(message: string): number | undefined {
  const m = message.match(/(?:прогноз|сигнал) · (\d+) дн\./i);
  return m ? Number(m[1]) : undefined;
}

function inferPatternFromMessage(message: string): string | undefined {
  const m = message.toLowerCase();
  if (m.includes('spike')) return 'spike';
  if (m.includes('drift')) return 'drift';
  if (m.includes('plateau') || m.includes('перегруз')) return 'plateau_high';
  if (m.includes('underconsumption') || m.includes('понижен')) return 'plateau_low';
  if (m.includes('oscillation') || m.includes('колебан')) return 'oscillation';
  if (m.includes('critical')) return 'critical_plateau';
  return undefined;
}

function alertDetailText(alert: AlertRecord, kind: NotificationLogKind): string {
  const pattern = inferPatternFromMessage(alert.message);
  const horizon = parseHorizon(alert.message);

  if (kind === 'predict') {
    const h = horizon ?? 7;
    if (pattern === 'spike') {
      return `ML сравнивает текущий профиль с ${h}-дневной базой и видит рост волатильности (σ). Это ранний прогноз: резкий скачок ещё не произошёл, но вероятность отклонения повышена. На презентации это этап «предупредить заранее».`;
    }
    if (pattern === 'drift') {
      return `Модель фиксирует устойчивый восходящий тренд на горизонте ${h} дней. Потребление растёт плавно — типичный drift, а не разовый spike. Полезно для планирования мощности и профилактики.`;
    }
    if (pattern === 'plateau_high') {
      return `Прогноз plateau ↑: нагрузка будет держаться выше нормы несколько суток. Обычно связано с перегревом, износом охлаждения или постоянной перегрузкой контура.`;
    }
    if (pattern === 'plateau_low') {
      return `Прогноз underconsumption ↓ на ${h} дней: линия будет стабильно ниже нормы. Возможны отказ группы нагрузки, ошибка датчика или несанкционированное отключение.`;
    }
    if (pattern === 'oscillation') {
      return `Прогноз oscillation: ML ожидает нестабильную нагрузку с колебаниями ±10–15%. Часто на линии ИБП или при нестабильном питании.`;
    }
    if (pattern === 'critical_plateau') {
      return `Критический прогноз на ${h} дней: длительный перегруз с высоким риском. Требуется эскалация до подтверждения на графике.`;
    }
    return `Ранний ML-прогноз на ${h} дней. Модель обнаружила отклонение от сезонного профиля до появления подтверждённой аномалии.`;
  }

  if (kind === 'precursor') {
    const h = horizon ?? 2;
    return `Сигнал (precursor) на ${h} дн.: confidence модели вырос — отклонение близко к порогу срабатывания. Это второй звуковой этап: «скоро на графике». Обычно следует через 8–16 с после прогноза в демо-сценарии.`;
  }

  if (alert.message.toLowerCase().includes('демо завершено')) {
    return 'Стресс-тест прошёл все типы девиаций: spike → drift → plateau → underconsumption → oscillation → critical plateau.';
  }

  return alert.message;
}

export function buildAlertLogEntry(alert: AlertRecord): NotificationLogEntry {
  const kind = classifyAlertKind(alert);
  return {
    id: `alert-${alert.id}`,
    kind,
    title: alertLogTitle(alert, kind),
    summary: alert.message,
    detail: alertDetailText(alert, kind),
    horizonDays: parseHorizon(alert.message),
    pattern: inferPatternFromMessage(alert.message),
    severity: alert.severity,
    timestamp: new Date(alert.triggered_at).getTime(),
    source: 'alert',
    sourceId: alert.id,
  };
}

export function buildAnomalyLogEntry(anomaly: AnomalyRecord): NotificationLogEntry {
  const pattern = inferAnomalyPattern(anomaly);
  const deviation = formatAnomalyDeviation(anomaly);
  const patternLabel = anomalyPatternLabel(pattern);

  return {
    id: `anomaly-${anomaly.id}`,
    kind: 'confirmed',
    title: 'Подтверждено · аномалия',
    summary: `${anomaly.sensor_label ?? anomaly.category}: ${anomaly.value.toFixed(1)} Вт (ожид. ${anomaly.expected?.toFixed(1) ?? '—'})`,
    detail: inferAnomalyCause(anomaly),
    pattern: pattern,
    severity: anomaly.severity,
    timestamp: new Date(anomaly.time).getTime(),
    source: 'anomaly',
    sourceId: anomaly.id,
    category: anomaly.category,
    valueLabel: `${deviation.text} · ${patternLabel}`,
  };
}

export function kindLabel(kind: NotificationLogKind): string {
  switch (kind) {
    case 'predict': return 'Прогноз';
    case 'precursor': return 'Сигнал';
    case 'confirmed': return 'Подтверждено';
    default: return 'Инфо';
  }
}

export function kindColor(kind: NotificationLogKind): string {
  switch (kind) {
    case 'predict': return '#1677ff';
    case 'precursor': return '#722ed1';
    case 'confirmed': return '#fa8c16';
    default: return '#64748b';
  }
}
