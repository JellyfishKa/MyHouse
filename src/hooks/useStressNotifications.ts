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

type AlertKind = 'predict' | 'precursor' | 'info';

function classifyAlert(alert: AlertRecord): AlertKind {
  const msg = alert.message.toLowerCase();
  if (msg.startsWith('прогноз ·')) return 'predict';
  if (msg.startsWith('сигнал ·')) return 'precursor';
  return 'info';
}

function alertTitle(alert: AlertRecord, kind: AlertKind): string {
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

function alertSoundKind(alert: AlertRecord, kind: AlertKind): AlertSoundKind {
  if (kind === 'predict') return 'predict';
  if (kind === 'precursor') return 'precursor';
  return alert.severity as AlertSoundKind;
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

      const kind = classifyAlert(alert);
      playAlertSound(alertSoundKind(alert, kind));

      const title = alertTitle(alert, kind);
      if (document.visibilityState === 'hidden' && typeof Notification !== 'undefined') {
        if (Notification.permission === 'granted') {
          new Notification(title, { body: alert.message, silent: false });
        } else if (Notification.permission === 'default') {
          void Notification.requestPermission();
        }
      }

      notification.open({
        message: title,
        description: kind === 'info' ? alert.message : undefined,
        placement: 'bottomRight',
        duration: kind === 'predict' ? 4 : kind === 'precursor' ? 5 : 6,
        type: kind === 'predict' ? 'info' : kind === 'precursor' ? 'warning' : undefined,
        style: {
          width: 300,
          borderLeft: kind === 'predict'
            ? '4px solid #1677ff'
            : kind === 'precursor'
              ? '4px solid #722ed1'
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
      if (document.visibilityState === 'hidden' && typeof Notification !== 'undefined') {
        if (Notification.permission === 'granted') {
          new Notification('Подтверждено', {
            body: `${a.sensor_label ?? a.category}`,
            silent: false,
          });
        }
      }
      notification.open({
        message: 'Подтверждено',
        description: `${a.sensor_label ?? a.category}`,
        placement: 'bottomRight',
        duration: 4,
        type: 'warning',
        style: {
          width: 280,
          borderLeft: `4px solid ${SEVERITY_COLOR[a.severity] ?? '#999'}`,
        },
      });
    });
  }, [active, anomalies, stressStartedAt]);
}
