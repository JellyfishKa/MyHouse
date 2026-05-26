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
import { message } from 'antd';
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
const STRESS_END_GRACE_MS = 5_000;
const RETRAIN_STEPS = [15, 30, 60, 90];

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
  const retrainChainRef = useRef(Promise.resolve());
  const startedAtRef = useRef<number | undefined>(undefined);
  const durationSecRef = useRef(300);

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

  useEffect(() => {
    document.body.classList.toggle('stress-active', active);
    return () => document.body.classList.remove('stress-active');
  }, [active]);

  const runRetrain = useCallback(
    async (days: number, _step?: number, showToast = true) => {
      const targetId = stressObjectIdRef.current ?? objectId;
      if (!targetId) return;
      try {
        const excludeSince = startedAtRef.current
          ? new Date(startedAtRef.current).toISOString()
          : undefined;
        const result = await retrainMutation.mutateAsync({
          object_id: targetId,
          days,
          exclude_since: excludeSince,
        });
        if (showToast && result.model_saved) {
          message.info(`ML дообучен на новых данных (${result.windows_trained} окон)`);
        } else if (showToast && !result.model_saved) {
          message.warning('ML retrain: недостаточно данных для сохранения модели');
        }
      } catch {
        if (showToast) {
          message.warning('ML retrain недоступен — продолжаем сценарий');
        }
      }
    },
    [objectId, retrainMutation],
  );

  const enqueueRetrain = useCallback(
    (days: number, step: number) => {
      retrainChainRef.current = retrainChainRef.current.then(() => runRetrain(days, step));
    },
    [runRetrain],
  );

  const endStressTest = useCallback(() => {
    const endedObjectId = stressObjectIdRef.current ?? objectId;
    const endedStartedAt = startedAtRef.current;
    const pendingRetrain = retrainChainRef.current;

    if (endTimerRef.current) {
      window.clearTimeout(endTimerRef.current);
      endTimerRef.current = undefined;
    }
    stressObjectIdRef.current = undefined;
    retrainDoneRef.current.clear();
    startedAtRef.current = undefined;
    setActive(false);
    setEquipmentId(undefined);
    setStartedAt(undefined);
    setEndsAt(undefined);
    setStressObjectId(undefined);
    setTick(0);

    if (endedObjectId) {
      const excludeSince = endedStartedAt
        ? new Date(endedStartedAt).toISOString()
        : undefined;
      void pendingRetrain.then(async () => {
        try {
          const result = await retrainMutation.mutateAsync({
            object_id: endedObjectId,
            days: 3,
            exclude_since: excludeSince,
          });
          if (!result.model_saved) {
            message.warning('Финальный ML retrain: модель не сохранена (мало данных)');
          }
        } catch {
          /* ML offline — ignore */
        }
        void queryClient.invalidateQueries({ queryKey: ['health-score', endedObjectId] });
        void queryClient.invalidateQueries({ queryKey: ['anomalies', endedObjectId] });
        void queryClient.invalidateQueries({ queryKey: ['predictive-insights', endedObjectId] });
        void queryClient.invalidateQueries({ queryKey: ['summary', endedObjectId] });
        void queryClient.invalidateQueries({ queryKey: ['rul', endedObjectId] });
        void queryClient.invalidateQueries({ queryKey: ['telemetry'] });
      });
    }
  }, [objectId, queryClient, retrainMutation]);

  const startStressTest = useCallback(
    ({ equipmentId: eqId, objectId: objId, durationSeconds }: {
      equipmentId: string;
      objectId: string;
      durationSeconds: number;
    }) => {
      const now = Date.now();
      durationSecRef.current = durationSeconds;
      const end = now + durationSeconds * 1000;
      if (endTimerRef.current) window.clearTimeout(endTimerRef.current);
      stressObjectIdRef.current = objId;
      retrainDoneRef.current.clear();
      retrainChainRef.current = Promise.resolve();
      startedAtRef.current = now;
      setEquipmentId(eqId);
      setStressObjectId(objId);
      setStartedAt(now);
      setEndsAt(end);
      setActive(true);
      setTick(0);
      endTimerRef.current = window.setTimeout(() => {
        endStressTest();
        message.info('Стресс-тест завершён');
      }, end - now + STRESS_END_GRACE_MS);
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
        enqueueRetrain(1, s);
      }
    }
  }, [active, startedAt, tick, enqueueRetrain]);

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
      {children}
      {active && (
        <StressTimeline startedAt={startedAt} endsAt={endsAt} tick={tick} />
      )}
    </StressTestContext.Provider>
  );
}
