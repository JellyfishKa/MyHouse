import { useMemo } from 'react';
import { Progress, Space, Tag, Typography } from 'antd';

const { Text } = Typography;

const TICK_SEC = 2;
const TOTAL_STEPS = 150;

const SCHEDULE = [
  { step: 12, kind: 'precursor', label: 'Предупр. servers', color: '#1677ff' },
  { step: 15, kind: 'anomaly', label: 'Аномалия servers +8%', color: '#52c41a' },
  { step: 27, kind: 'precursor', label: 'Предупр. cooling', color: '#1677ff' },
  { step: 30, kind: 'anomaly', label: 'Аномалия cooling +15%', color: '#faad14' },
  { step: 57, kind: 'precursor', label: 'Предупр. UPS', color: '#1677ff' },
  { step: 60, kind: 'anomaly', label: 'Аномалия UPS +28%', color: '#fa8c16' },
  { step: 87, kind: 'precursor', label: 'Предупр. critical', color: '#1677ff' },
  { step: 90, kind: 'anomaly', label: 'Critical servers +42%', color: '#ff4d4f' },
];

export interface StressPhaseInfo {
  phase: number;
  total: number;
  label: string;
}

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
  const { step, progress, nextEvent, elapsedSec, remainingSec } = useMemo(() => {
    const s = computeStressStep(startedAt);
    const elapsed = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0;
    const totalSec = startedAt && endsAt ? Math.floor((endsAt - startedAt) / 1000) : 300;
    const remaining = Math.max(0, totalSec - elapsed);
    const pct = Math.min(100, Math.round((s / TOTAL_STEPS) * 100));
    const upcoming = SCHEDULE.find((e) => e.step > s);
    return {
      step: s,
      progress: pct,
      nextEvent: upcoming,
      elapsedSec: elapsed,
      remainingSec: remaining,
    };
  }, [startedAt, endsAt, tick]);

  const doneEvents = SCHEDULE.filter((e) => e.step <= step);

  return (
    <div style={{ marginTop: 8 }}>
      <Space wrap size={8} style={{ marginBottom: 6 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          Шаг {step} · прошло {elapsedSec} с · осталось ~{remainingSec} с
        </Text>
        {nextEvent && (
          <Tag color="blue" style={{ margin: 0 }}>
            Далее: {nextEvent.label} (~{(nextEvent.step - step) * TICK_SEC} с)
          </Tag>
        )}
      </Space>
      <Progress
        percent={progress}
        size="small"
        strokeColor={{ from: '#52c41a', to: '#ff4d4f' }}
        showInfo={false}
      />
      <Space wrap size={4} style={{ marginTop: 6 }}>
        {doneEvents.map((e) => (
          <Tag key={`${e.step}-${e.label}`} color={e.color} style={{ margin: 0, fontSize: 11 }}>
            ✓ {e.label}
          </Tag>
        ))}
      </Space>
    </div>
  );
}
