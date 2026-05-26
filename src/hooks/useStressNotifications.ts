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

// #region agent log
const dbg = (location: string, message: string, data: Record<string, unknown>, hypothesisId: string) => {
  fetch('http://127.0.0.1:7375/ingest/39631315-b50a-4bb0-b4d2-a2c4b21d8170', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'dc4f99' },
    body: JSON.stringify({ sessionId: 'dc4f99', location, message, data, hypothesisId, timestamp: Date.now() }),
  }).catch(() => {});
};
// #endregion

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
  const wasActive = useRef(false);
  const sessionKey = useRef<number | undefined>(undefined);
  const anomalySeedDone = useRef(false);
  const alertSeedDone = useRef(false);

  useEffect(() => {
    if (!active) {
      if (wasActive.current) {
        // #region agent log
        dbg('useStressNotifications.ts:deactivate', 'stress notifications deactivated', {}, 'H2');
        // #endregion
      }
      wasActive.current = false;
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

    if (!wasActive.current) {
      wasActive.current = true;
      // #region agent log
      dbg('useStressNotifications.ts:activate', 'stress notifications activated', {
        anomalyCount: anomalies.length,
        alertCount: alerts.length,
        stressStartedAt,
        oldestAnomaly: anomalies[anomalies.length - 1]?.time,
        newestAnomaly: anomalies[0]?.time,
        seenAnomalySize: seenAnomalyIds.current.size,
      }, 'H1');
      // #endregion
    }

    return undefined;
  }, [active, anomalies, alerts, stressStartedAt]);

  useEffect(() => {
    if (!active || !onMlTrigger) return undefined;

    const timer = window.setTimeout(() => {
      if (!mlTriggered.current) {
        mlTriggered.current = true;
        onMlTrigger();
      }
    }, 120_000);

    return () => window.clearTimeout(timer);
  }, [active, stressStartedAt, onMlTrigger]);

  useEffect(() => {
    if (!active) return;

    if (!alertSeedDone.current) {
      alerts.forEach((alert) => seenAlertIds.current.add(alert.id));
      if (stressStartedAt && Date.now() - stressStartedAt >= 1000) {
        alertSeedDone.current = true;
        // #region agent log
        dbg('useStressNotifications.ts:seed-alerts', 'seeded existing alerts without toast', {
          seeded: alerts.length,
          stressStartedAt,
        }, 'H1');
        // #endregion
      }
      return;
    }

    let notified = 0;
    alerts.forEach((alert) => {
      if (seenAlertIds.current.has(alert.id)) return;
      if (stressStartedAt && new Date(alert.triggered_at).getTime() < stressStartedAt - 5000) return;
      seenAlertIds.current.add(alert.id);
      notified += 1;

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
    if (notified > 0) {
      // #region agent log
      dbg('useStressNotifications.ts:alerts', 'alert notifications fired', { notified, totalAlerts: alerts.length }, 'H1');
      // #endregion
    }
  }, [active, alerts, stressStartedAt]);

  useEffect(() => {
    if (!active) return;

    if (!anomalySeedDone.current) {
      anomalies.forEach((a) => seenAnomalyIds.current.add(a.id));
      if (stressStartedAt && Date.now() - stressStartedAt >= 1000) {
        anomalySeedDone.current = true;
        // #region agent log
        dbg('useStressNotifications.ts:seed-anomalies', 'seeded existing anomalies without toast', {
          seeded: anomalies.length,
          stressStartedAt,
        }, 'H1');
        // #endregion
      }
      return;
    }

    let notified = 0;
    anomalies.forEach((a) => {
      if (seenAnomalyIds.current.has(a.id)) return;
      if (stressStartedAt && new Date(a.time).getTime() < stressStartedAt - 5000) return;
      seenAnomalyIds.current.add(a.id);
      notified += 1;

      playAlertSound(a.severity as AlertSoundKind);
      notification.open({
        message: `Аномалия · ${SEVERITY_LABEL[a.severity] ?? a.severity}`,
        description: `${a.sensor_label ?? a.category}: ${a.value.toFixed(1)} Вт (ожид. ${a.expected?.toFixed(1) ?? '—'})`,
        placement: 'bottomRight',
        duration: 7,
        style: { width: 320 },
      });
    });
    if (notified > 0) {
      // #region agent log
      dbg('useStressNotifications.ts:anomalies', 'anomaly notifications fired', {
        notified,
        totalAnomalies: anomalies.length,
        severities: anomalies.slice(0, notified).map((a) => a.severity),
      }, 'H1');
      // #endregion
    }
  }, [active, anomalies, stressStartedAt]);
}
