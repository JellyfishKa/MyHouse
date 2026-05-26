import { useMemo } from 'react';
import { Progress, Typography } from 'antd';

const { Text } = Typography;

export interface StressPhaseInfo {
  phase: number;
  total: number;
  label: string;
}

const TICK_SEC = 2;

export function computeStressStep(startedAt?: number, now = Date.now()): number {
  if (!startedAt) return 0;
  return Math.floor((now - startedAt) / (TICK_SEC * 1000));
}

export function computeStressPhase(step: number): StressPhaseInfo {
  if (step < 9) return { phase: 1, total: 6, label: 'Базовая линия' };
  if (step < 18) return { phase: 2, total: 6, label: 'Spike + drift · серверы' };
  if (step < 29) return { phase: 3, total: 6, label: 'Plateau ↑ · охлаждение' };
  if (step < 39) return { phase: 4, total: 6, label: 'Underconsumption ↓ · освещение' };
  if (step < 51) return { phase: 5, total: 6, label: 'Oscillation · ИБП' };
  return { phase: 6, total: 6, label: 'Critical plateau · серверы' };
}

interface StressTimelineProps {
  startedAt?: number;
  endsAt?: number;
  tick?: number;
}

export default function StressTimeline({ startedAt, endsAt, tick = 0 }: StressTimelineProps) {
  const { elapsedSec, remainingSec, progress, startLabel } = useMemo(() => {
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

    return { elapsedSec: elapsed, remainingSec: remaining, progress: pct, startLabel };
  }, [startedAt, endsAt, tick]);

  return (
    <div className="stress-timeline-bar">
      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
        Стресс-тест · старт {startLabel} · прошло {elapsedSec} с · осталось {remainingSec} с
      </Text>
      <Progress percent={progress} size="small" showInfo={false} strokeColor="#faad14" />
    </div>
  );
}
