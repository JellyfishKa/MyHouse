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
  useCancelStressTest,
  useEquipmentAlerts,
  useRetrainMl,
  type AnomalyRecord,
} from '../api/hooks';
import StressTimeline, {
  computeStressPhase,
  computeStressStep,
  type StressPhaseInfo,
} from '../components/StressTimeline';
import { useStressNotifications } from '../hooks/useStressNotifications';
import { useNotificationLog } from '../context/NotificationLogContext';
import NotificationLogPanel from '../components/NotificationLogPanel';

const POLL_MS = 2000;
const STRESS_END_GRACE_MS = 5_000;
const RETRAIN_STEPS = [9, 18, 36, 54];

export type { StressPhaseInfo };

export interface StressTestContextValue {
  active: boolean;
  equipmentId?: string;
  startedAt?: number;
  endsAt?: number;
  objectId?: string;
  stressPhase?: StressPhaseInfo;
  stressStep?: number;
  tick: number;
  anomalies: AnomalyRecord[];
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
  const { clearLog, entries } = useNotificationLog();
  const retrainMutation = useRetrainMl();
  const cancelStressMutation = useCancelStressTest();
  const endTimerRef = useRef<number | undefined>(undefined);
  const stressObjectIdRef = useRef<string | undefined>(undefined);
  const retrainDoneRef = useRef(new Set<number>());
  const retrainChainRef = useRef(Promise.resolve());
  const startedAtRef = useRef<number | undefined>(undefined);
  const durationSecRef = useRef(180);

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

  const stressStep = useMemo(() => {
    if (!active || !startedAt) return undefined;
    return computeStressStep(startedAt);
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

    if (endedObjectId) {
      void cancelStressMutation.mutateAsync({ object_id: endedObjectId }).catch(() => {
        /* backend offline — local reset still proceeds */
      });
    }

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
  }, [objectId, queryClient, retrainMutation, cancelStressMutation]);

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
      clearLog();
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
    [endStressTest, clearLog],
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
        enqueueRetrain(30, s);
      }
    }
  }, [active, startedAt, tick, enqueueRetrain]);

  useStressNotifications({
    active,
    anomalies,
    alerts,
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
      stressStep,
      tick,
      anomalies,
      startStressTest,
      endStressTest,
    }),
    [active, equipmentId, startedAt, endsAt, stressObjectId, objectId, stressPhase, stressStep, tick, anomalies, startStressTest, endStressTest],
  );

  return (
    <StressTestContext.Provider value={value}>
      {children}
      <NotificationLogPanel visible={active || entries.length > 0} />
      {active && (
        <StressTimeline startedAt={startedAt} endsAt={endsAt} tick={tick} />
      )}
    </StressTestContext.Provider>
  );
}
