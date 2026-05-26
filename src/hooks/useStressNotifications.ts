import { useEffect, useRef } from 'react';
import { notification } from 'antd';
import { playAlertSound, type AlertSoundKind } from '../utils/alertSound';
import type { AlertRecord, AnomalyRecord } from '../api/hooks';

const SEVERITY_LABEL: Record<string, string> = {
  low: 'Низкий',
  medium: 'Средний',
  high: 'Высокий',
  critical: 'Критический',
};

interface UseStressNotificationsOptions {
  active: boolean;
  anomalies: AnomalyRecord[];
  alerts: AlertRecord[];
  onMlTrigger?: () => void;
}

export function useStressNotifications({
  active,
  anomalies,
  alerts,
  onMlTrigger,
}: UseStressNotificationsOptions) {
  const seenAnomalyIds = useRef(new Set<string>());
  const seenAlertIds = useRef(new Set<string>());
  const mlTriggered = useRef(false);

  useEffect(() => {
    if (!active) {
      seenAnomalyIds.current.clear();
      seenAlertIds.current.clear();
      mlTriggered.current = false;
      return undefined;
    }

    const timer = window.setTimeout(() => {
      if (!mlTriggered.current && onMlTrigger) {
        mlTriggered.current = true;
        onMlTrigger();
      }
    }, 120_000);

    return () => window.clearTimeout(timer);
  }, [active, onMlTrigger]);

  useEffect(() => {
    if (!active) return;

    alerts.forEach((alert) => {
      if (seenAlertIds.current.has(alert.id)) return;
      seenAlertIds.current.add(alert.id);

      const isPrecursor = alert.message.toLowerCase().includes('предупреждение')
        || alert.message.toLowerCase().includes('через');
      const kind: AlertSoundKind = isPrecursor ? 'precursor' : alert.severity;

      playAlertSound(kind);
      notification.open({
        message: isPrecursor ? 'Предупреждение' : `Оповещение · ${SEVERITY_LABEL[alert.severity] ?? alert.severity}`,
        description: alert.message,
        placement: 'bottomRight',
        duration: 6,
        style: { width: 320 },
      });
    });
  }, [active, alerts]);

  useEffect(() => {
    if (!active) return;

    anomalies.forEach((a) => {
      if (seenAnomalyIds.current.has(a.id)) return;
      seenAnomalyIds.current.add(a.id);

      playAlertSound(a.severity as AlertSoundKind);
      notification.open({
        message: `Аномалия · ${SEVERITY_LABEL[a.severity] ?? a.severity}`,
        description: `${a.sensor_label ?? a.category}: ${a.value.toFixed(1)} Вт (ожид. ${a.expected?.toFixed(1) ?? '—'})`,
        placement: 'bottomRight',
        duration: 7,
        style: { width: 320 },
      });
    });
  }, [active, anomalies]);
}
