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

const SEVERITY_COLOR: Record<string, string> = {
  low: '#52c41a',
  medium: '#faad14',
  high: '#fa8c16',
  critical: '#ff4d4f',
};

function isPrecursorAlert(alert: AlertRecord): boolean {
  const msg = alert.message.toLowerCase();
  return msg.includes('предупреждение') || msg.includes('через ~');
}

interface UseStressNotificationsOptions {
  active: boolean;
  anomalies: AnomalyRecord[];
  alerts: AlertRecord[];
  onMlTrigger?: () => void;
  stressStartedAt?: number;
}

export function useStressNotifications({
  active,
  anomalies,
  alerts,
  onMlTrigger,
  stressStartedAt,
}: UseStressNotificationsOptions) {
  const seenAnomalyIds = useRef(new Set<string>());
  const seenAlertIds = useRef(new Set<string>());
  const mlTriggered = useRef(false);
  const onMlTriggerRef = useRef(onMlTrigger);
  const sessionKey = useRef<number | undefined>(undefined);
  const anomalySeedDone = useRef(false);
  const alertSeedDone = useRef(false);

  useEffect(() => {
    if (!active) {
      sessionKey.current = undefined;
      anomalySeedDone.current = false;
      alertSeedDone.current = false;
      seenAnomalyIds.current.clear();
      seenAlertIds.current.clear();
      mlTriggered.current = false;
      return undefined;
    }

    if (stressStartedAt && sessionKey.current !== stressStartedAt) {
      sessionKey.current = stressStartedAt;
      anomalySeedDone.current = false;
      alertSeedDone.current = false;
      seenAnomalyIds.current.clear();
      seenAlertIds.current.clear();
      mlTriggered.current = false;
    }

    return undefined;
  }, [active, stressStartedAt]);

  useEffect(() => {
    onMlTriggerRef.current = onMlTrigger;
  }, [onMlTrigger]);

  useEffect(() => {
    if (!active) return undefined;

    const timer = window.setTimeout(() => {
      if (!mlTriggered.current) {
        mlTriggered.current = true;
        onMlTriggerRef.current?.();
      }
    }, 120_000);

    return () => window.clearTimeout(timer);
  }, [active, stressStartedAt]);

  useEffect(() => {
    if (!active) return;

    if (!alertSeedDone.current) {
      alerts.forEach((alert) => seenAlertIds.current.add(alert.id));
      if (stressStartedAt && Date.now() - stressStartedAt >= 1000) {
        alertSeedDone.current = true;
      }
      return;
    }

    alerts.forEach((alert) => {
      if (seenAlertIds.current.has(alert.id)) return;
      if (stressStartedAt && new Date(alert.triggered_at).getTime() < stressStartedAt - 5000) return;
      seenAlertIds.current.add(alert.id);

      const precursor = isPrecursorAlert(alert);
      const kind: AlertSoundKind = precursor ? 'precursor' : alert.severity;

      playAlertSound(kind);
      notification.open({
        message: precursor
          ? 'Возможная аномалия через ~6 с'
          : `Оповещение · ${SEVERITY_LABEL[alert.severity] ?? alert.severity}`,
        description: alert.message,
        placement: 'bottomRight',
        duration: precursor ? 5 : 6,
        type: precursor ? 'info' : undefined,
        style: {
          width: 320,
          borderLeft: precursor
            ? '4px solid #1677ff'
            : `4px solid ${SEVERITY_COLOR[alert.severity] ?? '#999'}`,
        },
      });
    });
  }, [active, alerts, stressStartedAt]);

  useEffect(() => {
    if (!active) return;

    if (!anomalySeedDone.current) {
      anomalies.forEach((a) => seenAnomalyIds.current.add(a.id));
      if (stressStartedAt && Date.now() - stressStartedAt >= 1000) {
        anomalySeedDone.current = true;
      }
      return;
    }

    anomalies.forEach((a) => {
      if (seenAnomalyIds.current.has(a.id)) return;
      if (stressStartedAt && new Date(a.time).getTime() < stressStartedAt - 5000) return;
      seenAnomalyIds.current.add(a.id);

      playAlertSound(a.severity as AlertSoundKind);
      notification.open({
        message: `Аномалия подтверждена · ${SEVERITY_LABEL[a.severity] ?? a.severity}`,
        description: `${a.sensor_label ?? a.category}: ${a.value.toFixed(1)} Вт (ожид. ${a.expected?.toFixed(1) ?? '—'})`,
        placement: 'bottomRight',
        duration: 7,
        type: 'warning',
        style: {
          width: 320,
          borderLeft: `4px solid ${SEVERITY_COLOR[a.severity] ?? '#999'}`,
        },
      });
    });
  }, [active, anomalies, stressStartedAt]);
}
