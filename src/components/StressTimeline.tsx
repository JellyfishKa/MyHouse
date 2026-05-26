import { useMemo } from 'react';
import { Progress, Tag, Typography } from 'antd';
import { STRESS_TICK_SEC, computeStressSignal } from '../constants/stressSteps';

const { Text } = Typography;

export interface StressPhaseInfo {
  phase: number;
  total: number;
  label: string;
}

export function computeStressStep(startedAt?: number, now = Date.now()): number {
  if (!startedAt) return 0;
  return Math.floor((now - startedAt) / (STRESS_TICK_SEC * 1000));
}

export function computeStressPhase(step: number): StressPhaseInfo {
  if (step < 9) return { phase: 1, total: 6, label: 'База + ранний прогноз' };
  if (step < 18) return { phase: 2, total: 6, label: 'Spike + drift · серверы' };
  if (step < 29) return { phase: 3, total: 6, label: 'Plateau ↑ · охлаждение' };
  if (step < 36) return { phase: 4, total: 6, label: 'Underconsumption ↓ · освещение' };
  if (step < 49) return { phase: 5, total: 6, label: 'Oscillation · ИБП' };
  return { phase: 6, total: 6, label: 'Critical plateau · серверы' };
}

export { computeStressSignal } from '../constants/stressSteps';

interface StressTimelineProps {
  startedAt?: number;
  endsAt?: number;
  tick?: number;
}

export default function StressTimeline({ startedAt, endsAt, tick = 0 }: StressTimelineProps) {
  const { elapsedSec, remainingSec, progress, startLabel, signal } = useMemo(() => {
    const elapsed = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0;
    const totalSec = startedAt && endsAt ? Math.floor((endsAt - startedAt) / 1000) : 180;
    const remaining = Math.max(0, totalSec - elapsed);
    const pct = totalSec > 0 ? Math.min(100, Math.round((elapsed / totalSec) * 100)) : 0;
    const startLabel = startedAt
      ? new Date(startedAt).toLocaleTimeString('ru-RU', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      : '—';
    const step = computeStressStep(startedAt);
    const signal = computeStressSignal(step);

    return { elapsedSec: elapsed, remainingSec: remaining, progress: pct, startLabel, signal };
  }, [startedAt, endsAt, tick]);

  return (
    <div className="stress-timeline-bar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          Стресс · {startLabel} · {elapsedSec} с · −{remainingSec} с
        </Text>
        {signal && (
          <Tag color={signal.color} style={{ margin: 0, fontSize: 11 }}>
            {signal.tag}
          </Tag>
        )}
        <Tag style={{ margin: 0, fontSize: 11, background: 'rgba(22,119,255,0.12)', border: '1px solid rgba(22,119,255,0.35)', color: '#1677ff' }}>
          2 / 7 / 30 дн.
        </Tag>
      </div>
      <Progress percent={progress} size="small" showInfo={false} strokeColor="#faad14" />
    </div>
  );
}
