import { useEffect, useRef } from 'react';
import { notification } from 'antd';
import { useNotificationLogOptional } from '../context/NotificationLogContext';
import { playAlertSound, type AlertSoundKind } from '../utils/alertSound';
import type { AlertRecord, AnomalyRecord } from '../api/hooks';
import {
  alertLogTitle,
  buildAlertLogEntry,
  buildAnomalyLogEntry,
  classifyAlertKind,
  type NotificationLogKind,
} from '../utils/notificationLogUtils';

const SEVERITY_COLOR: Record<string, string> = {
  low: '#52c41a',
  medium: '#faad14',
  high: '#fa8c16',
  critical: '#ff4d4f',
};

function alertSoundKind(alert: AlertRecord, kind: NotificationLogKind): AlertSoundKind {
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
  const log = useNotificationLogOptional();
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

      const kind = classifyAlertKind(alert);
      const entry = buildAlertLogEntry(alert);
      log?.addEntry(entry);

      playAlertSound(alertSoundKind(alert, kind));

      const title = alertLogTitle(alert, kind);
      if (document.visibilityState === 'hidden' && typeof Notification !== 'undefined') {
        if (Notification.permission === 'granted') {
          new Notification(title, { body: alert.message, silent: false });
        } else if (Notification.permission === 'default') {
          void Notification.requestPermission();
        }
      }

      notification.open({
        message: title,
        description: 'Нажмите для подробностей',
        placement: 'bottomRight',
        duration: kind === 'predict' ? 4 : kind === 'precursor' ? 5 : 6,
        type: kind === 'predict' ? 'info' : kind === 'precursor' ? 'warning' : undefined,
        style: {
          width: 300,
          cursor: 'pointer',
          borderLeft: kind === 'predict'
            ? '4px solid #1677ff'
            : kind === 'precursor'
              ? '4px solid #722ed1'
              : `4px solid ${SEVERITY_COLOR[alert.severity] ?? '#999'}`,
        },
        onClick: () => log?.openDetail(entry),
      });
    });
  }, [active, alerts, stressStartedAt, log]);

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

      const entry = buildAnomalyLogEntry(a);
      log?.addEntry(entry);

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
        description: 'Нажмите для подробностей',
        placement: 'bottomRight',
        duration: 4,
        type: 'warning',
        style: {
          width: 280,
          cursor: 'pointer',
          borderLeft: `4px solid ${SEVERITY_COLOR[a.severity] ?? '#999'}`,
        },
        onClick: () => log?.openDetail(entry),
      });
    });
  }, [active, anomalies, stressStartedAt, log]);
}
