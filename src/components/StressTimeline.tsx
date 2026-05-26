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
  if (step < 15) return { phase: 1, total: 4, label: 'Базовая линия' };
  if (step < 30) return { phase: 2, total: 4, label: 'servers +8%' };
  if (step < 60) return { phase: 3, total: 4, label: 'cooling +15%' };
  if (step < 90) return { phase: 4, total: 4, label: 'ups +28%' };
  return { phase: 4, total: 4, label: 'servers +42% critical' };
}

interface StressTimelineProps {
  startedAt?: number;
  endsAt?: number;
  tick?: number;
}

export default function StressTimeline({ startedAt, endsAt, tick = 0 }: StressTimelineProps) {
  const { elapsedSec, remainingSec, progress, startLabel } = useMemo(() => {
    const elapsed = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0;
    const totalSec = startedAt && endsAt ? Math.floor((endsAt - startedAt) / 1000) : 300;
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
