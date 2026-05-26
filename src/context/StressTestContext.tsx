import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Alert, Space, Tag, message } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import {
  useAnomalies,
  useEquipmentAlerts,
  useRetrainMl,
  useTriggerDetection,
} from '../api/hooks';
import StressTimeline, {
  computeStressPhase,
  computeStressStep,
  type StressPhaseInfo,
} from '../components/StressTimeline';
import { useStressNotifications } from '../hooks/useStressNotifications';

const POLL_MS = 2000;
const STRESS_UI_BUFFER_MS = 60_000;
const RETRAIN_STEPS = [15, 30, 60, 90];

const SEVERITY_LEGEND = [
  { key: 'low', label: 'Низкий', color: '#52c41a' },
  { key: 'medium', label: 'Средний', color: '#faad14' },
  { key: 'high', label: 'Высокий', color: '#fa8c16' },
  { key: 'critical', label: 'Критический', color: '#ff4d4f' },
];

export type { StressPhaseInfo };

export interface StressTestContextValue {
  active: boolean;
  equipmentId?: string;
  startedAt?: number;
  endsAt?: number;
  objectId?: string;
  stressPhase?: StressPhaseInfo;
  tick: number;
  startStressTest: (params: {
    equipmentId: string;
    objectId: string;
    durationSeconds: number;
  }) => void;
  endStressTest: () => void;
}

const StressTestContext = createContext<StressTestContextValue | null>(null);

export function useStressTestContext() {
  const ctx = useContext(StressTestContext);
  if (!ctx) throw new Error('useStressTestContext must be used within StressTestProvider');
  return ctx;
}

export function useStressTestContextOptional() {
  return useContext(StressTestContext);
}

interface StressTestProviderProps {
  objectId?: string;
  children: ReactNode;
}

export function StressTestProvider({ objectId, children }: StressTestProviderProps) {
  const queryClient = useQueryClient();
  const detectMutation = useTriggerDetection();
  const retrainMutation = useRetrainMl();
  const endTimerRef = useRef<number | undefined>(undefined);
  const stressObjectIdRef = useRef<string | undefined>(undefined);
  const retrainDoneRef = useRef(new Set<number>());

  const [active, setActive] = useState(false);
  const [equipmentId, setEquipmentId] = useState<string>();
  const [startedAt, setStartedAt] = useState<number>();
  const [endsAt, setEndsAt] = useState<number>();
  const [stressObjectId, setStressObjectId] = useState<string>();
  const [tick, setTick] = useState(0);

  const pollObjectId = active ? (stressObjectId ?? objectId) : objectId;

  const { data: anomalies = [] } = useAnomalies(
    pollObjectId,
    undefined,
    active ? POLL_MS : false,
  );
  const { data: alerts = [] } = useEquipmentAlerts(
    equipmentId,
    active ? POLL_MS : false,
  );

  const stressPhase = useMemo(() => {
    if (!active || !startedAt) return undefined;
    return computeStressPhase(computeStressStep(startedAt));
  }, [active, startedAt, tick]);

  useEffect(() => {
    if (!active) return undefined;
    const id = window.setInterval(() => setTick((t) => t + 1), POLL_MS);
    return () => window.clearInterval(id);
  }, [active]);

  const runRetrain = useCallback(
    async (days: number, showToast = true) => {
      const targetId = stressObjectIdRef.current ?? objectId;
      if (!targetId) return;
      try {
        const excludeSince = startedAt
          ? new Date(startedAt).toISOString()
          : undefined;
        const result = await retrainMutation.mutateAsync({
          object_id: targetId,
          days,
          exclude_since: excludeSince,
        });
        if (showToast && result.model_saved) {
          message.info(`ML дообучен на новых данных (${result.windows_trained} окон)`);
        }
      } catch {
        if (showToast) {
          message.warning('ML retrain недоступен — продолжаем сценарий');
        }
      }
    },
    [objectId, retrainMutation, startedAt],
  );

  const endStressTest = useCallback(() => {
    const endedObjectId = stressObjectIdRef.current ?? objectId;
    if (endTimerRef.current) {
      window.clearTimeout(endTimerRef.current);
      endTimerRef.current = undefined;
    }
    stressObjectIdRef.current = undefined;
    retrainDoneRef.current.clear();
    setActive(false);
    setEquipmentId(undefined);
    setStartedAt(undefined);
    setEndsAt(undefined);
    setStressObjectId(undefined);
    setTick(0);

    if (endedObjectId) {
      void (async () => {
        try {
          await retrainMutation.mutateAsync({
            object_id: endedObjectId,
            days: 3,
          });
        } catch {
          /* ML offline — ignore */
        }
        void queryClient.invalidateQueries({ queryKey: ['health-score', endedObjectId] });
        void queryClient.invalidateQueries({ queryKey: ['anomalies', endedObjectId] });
        void queryClient.invalidateQueries({ queryKey: ['predictive-insights', endedObjectId] });
      })();
    }
  }, [objectId, queryClient, retrainMutation]);

  const startStressTest = useCallback(
    ({ equipmentId: eqId, objectId: objId, durationSeconds }: {
      equipmentId: string;
      objectId: string;
      durationSeconds: number;
    }) => {
      const now = Date.now();
      const end = now + durationSeconds * 1000 + STRESS_UI_BUFFER_MS;
      if (endTimerRef.current) window.clearTimeout(endTimerRef.current);
      stressObjectIdRef.current = objId;
      retrainDoneRef.current.clear();
      setEquipmentId(eqId);
      setStressObjectId(objId);
      setStartedAt(now);
      setEndsAt(end);
      setActive(true);
      setTick(0);
      endTimerRef.current = window.setTimeout(() => {
        endStressTest();
        message.info('Стресс-тест завершён');
      }, end - now);
    },
    [endStressTest],
  );

  useEffect(() => () => {
    if (endTimerRef.current) window.clearTimeout(endTimerRef.current);
  }, []);

  useEffect(() => {
    if (!active || !startedAt) return;
    const step = computeStressStep(startedAt);
    for (const s of RETRAIN_STEPS) {
      if (step >= s && !retrainDoneRef.current.has(s)) {
        retrainDoneRef.current.add(s);
        void runRetrain(1);
      }
    }
  }, [active, startedAt, tick, runRetrain]);

  const handleAutoMl = useCallback(async () => {
    const targetId = stressObjectId ?? objectId;
    if (!targetId) return;
    try {
      const result = await detectMutation.mutateAsync({ object_id: targetId, days: 3 });
      await queryClient.invalidateQueries({ queryKey: ['anomalies', targetId] });
      message.info(
        `ML-анализ (авто): найдено ${result.anomalies_found}, записано ${result.anomalies_inserted}`,
      );
    } catch {
      message.warning('Авто ML-анализ недоступен — продолжаем сценарий стресс-теста');
    }
  }, [stressObjectId, objectId, detectMutation, queryClient]);

  useStressNotifications({
    active,
    anomalies,
    alerts,
    onMlTrigger: handleAutoMl,
    stressStartedAt: startedAt,
  });

  const value = useMemo<StressTestContextValue>(
    () => ({
      active,
      equipmentId,
      startedAt,
      endsAt,
      objectId: stressObjectId ?? objectId,
      stressPhase,
      tick,
      startStressTest,
      endStressTest,
    }),
    [active, equipmentId, startedAt, endsAt, stressObjectId, objectId, stressPhase, tick, startStressTest, endStressTest],
  );

  return (
    <StressTestContext.Provider value={value}>
      {active && (
        <div style={{ padding: '0 16px 8px' }}>
          <Alert
            type="warning"
            message="Стресс-тест активен — уведомления и метрики обновляются на всех вкладках"
            showIcon
            banner
          />
          <StressTimeline startedAt={startedAt} endsAt={endsAt} tick={tick} />
          <Space wrap size={8} style={{ marginTop: 8 }}>
            {SEVERITY_LEGEND.map((s) => (
              <Tag key={s.key} color={s.color} style={{ margin: 0 }}>
                {s.label}
              </Tag>
            ))}
          </Space>
        </div>
      )}
      {children}
    </StressTestContext.Provider>
  );
}
