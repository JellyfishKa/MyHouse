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
  useStressStatus,
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
const RETRAIN_STEPS = [9, 18, 36, 54];

export type { StressPhaseInfo };

export interface StressTestContextValue {
  active: boolean;
  isInitiator: boolean;
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
    startedAt?: number;
    serverStep?: number;
    initiator?: boolean;
  }) => void;
  endStressTest: (options?: { localOnly?: boolean }) => void;
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

function scheduleEndTimer(
  endTimerRef: React.MutableRefObject<number | undefined>,
  endsAt: number,
  onEnd: () => void,
) {
  if (endTimerRef.current) window.clearTimeout(endTimerRef.current);
  const delay = Math.max(0, endsAt - Date.now());
  endTimerRef.current = window.setTimeout(onEnd, delay);
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
  const isInitiatorRef = useRef(false);
  const autoJoinAttemptedRef = useRef<string | undefined>(undefined);

  const [active, setActive] = useState(false);
  const [isInitiator, setIsInitiator] = useState(false);
  const [equipmentId, setEquipmentId] = useState<string>();
  const [startedAt, setStartedAt] = useState<number>();
  const [endsAt, setEndsAt] = useState<number>();
  const [stressObjectId, setStressObjectId] = useState<string>();
  const [serverStep, setServerStep] = useState<number>();
  const [tick, setTick] = useState(0);

  const statusPollMs = objectId ? POLL_MS : false;
  const { data: remoteStatus } = useStressStatus(objectId, statusPollMs);

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

  const stressStep = useMemo(() => {
    if (!active || !startedAt) return undefined;
    if (serverStep != null) return serverStep;
    return computeStressStep(startedAt);
  }, [active, startedAt, serverStep, tick]);

  const stressPhase = useMemo(() => {
    if (!active || stressStep == null) return undefined;
    return computeStressPhase(stressStep);
  }, [active, stressStep, tick]);

  useEffect(() => {
    if (!active) return undefined;
    const id = window.setInterval(() => setTick((t) => t + 1), POLL_MS);
    return () => window.clearInterval(id);
  }, [active]);

  useEffect(() => {
    document.body.classList.toggle('stress-active', active);
    return () => document.body.classList.remove('stress-active');
  }, [active]);

  useEffect(() => {
    if (remoteStatus?.step != null && active) {
      const maxStep = Math.floor(durationSecRef.current / 2);
      setServerStep(Math.max(0, Math.min(maxStep, remoteStatus.step)));
    }
  }, [remoteStatus?.step, active]);

  const endStressTestLocal = useCallback(() => {
    if (endTimerRef.current) {
      window.clearTimeout(endTimerRef.current);
      endTimerRef.current = undefined;
    }
    stressObjectIdRef.current = undefined;
    retrainDoneRef.current.clear();
    startedAtRef.current = undefined;
    isInitiatorRef.current = false;
    // do NOT reset autoJoinAttemptedRef here — keeps blocking re-join while backend still reports active
    setActive(false);
    setIsInitiator(false);
    setEquipmentId(undefined);
    setStartedAt(undefined);
    setEndsAt(undefined);
    setStressObjectId(undefined);
    setServerStep(undefined);
    setTick(0);
  }, []);

  const runRetrain = useCallback(
    async (days: number, _step?: number, showToast = true) => {
      if (!isInitiatorRef.current) return;
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

  const endStressTest = useCallback((options?: { localOnly?: boolean }) => {
    const endedObjectId = stressObjectIdRef.current ?? objectId;
    const endedStartedAt = startedAtRef.current;
    const pendingRetrain = retrainChainRef.current;
    const wasInitiator = isInitiatorRef.current;
    const localOnly = options?.localOnly ?? false;

    if (endedObjectId && wasInitiator && !localOnly) {
      void cancelStressMutation.mutateAsync({ object_id: endedObjectId }).catch(() => {
        /* backend offline */
      });
    }

    endStressTestLocal();

    if (endedObjectId && wasInitiator && !localOnly) {
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
          /* ML offline */
        }
        void queryClient.invalidateQueries({ queryKey: ['health-score', endedObjectId] });
        void queryClient.invalidateQueries({ queryKey: ['anomalies', endedObjectId] });
        void queryClient.invalidateQueries({ queryKey: ['predictive-insights', endedObjectId] });
        void queryClient.invalidateQueries({ queryKey: ['summary', endedObjectId] });
        void queryClient.invalidateQueries({ queryKey: ['rul', endedObjectId] });
        void queryClient.invalidateQueries({ queryKey: ['telemetry'] });
        void queryClient.invalidateQueries({ queryKey: ['stress-status', endedObjectId] });
      });
    }
  }, [objectId, queryClient, retrainMutation, cancelStressMutation, endStressTestLocal]);

  const startStressTest = useCallback(
    ({
      equipmentId: eqId,
      objectId: objId,
      durationSeconds,
      startedAt: serverStartedAt,
      serverStep: initialStep,
      initiator = true,
    }: {
      equipmentId: string;
      objectId: string;
      durationSeconds: number;
      startedAt?: number;
      serverStep?: number;
      initiator?: boolean;
    }) => {
      const start = serverStartedAt ?? Date.now();
      durationSecRef.current = durationSeconds;
      const end = start + durationSeconds * 1000;

      stressObjectIdRef.current = objId;
      isInitiatorRef.current = initiator;
      autoJoinAttemptedRef.current = objId;

      if (initiator) {
        retrainDoneRef.current.clear();
        retrainChainRef.current = Promise.resolve();
        clearLog();
      }

      startedAtRef.current = start;
      setEquipmentId(eqId);
      setStressObjectId(objId);
      setStartedAt(start);
      setEndsAt(end);
      const maxStep = Math.floor(durationSeconds / 2);
      setServerStep(initialStep != null ? Math.max(0, Math.min(maxStep, initialStep)) : undefined);
      setIsInitiator(initiator);
      setActive(true);
      setTick(0);

      scheduleEndTimer(endTimerRef, end, () => {
        endStressTest({ localOnly: !isInitiatorRef.current });
        message.info('Стресс-тест завершён');
      });
    },
    [endStressTest, clearLog],
  );

  useEffect(() => () => {
    if (endTimerRef.current) window.clearTimeout(endTimerRef.current);
  }, []);

  useEffect(() => {
    if (!remoteStatus?.active) {
      autoJoinAttemptedRef.current = undefined;
    }
  }, [remoteStatus?.active]);

  useEffect(() => {
    if (active || !objectId || !remoteStatus?.active) return;
    if (autoJoinAttemptedRef.current === objectId) return;
    if (!remoteStatus.equipment_id || !remoteStatus.started_at) return;

    autoJoinAttemptedRef.current = objectId;
    const start = new Date(remoteStatus.started_at).getTime();
    startStressTest({
      equipmentId: remoteStatus.equipment_id,
      objectId,
      durationSeconds: remoteStatus.duration_seconds ?? 180,
      startedAt: start,
      serverStep: remoteStatus.step,
      initiator: false,
    });
    message.info('Подключились к общему стресс-тесту');
  }, [active, objectId, remoteStatus, startStressTest]);

  useEffect(() => {
    if (!active || !stressObjectId) return;
    if (remoteStatus?.active === false) {
      endStressTestLocal();
      void queryClient.invalidateQueries({ queryKey: ['stress-status', stressObjectId] });
    }
  }, [active, remoteStatus?.active, stressObjectId, endStressTestLocal, queryClient]);

  useEffect(() => {
    if (!active || !startedAt) return;
    const step = serverStep ?? computeStressStep(startedAt);
    for (const s of RETRAIN_STEPS) {
      if (step >= s && !retrainDoneRef.current.has(s)) {
        retrainDoneRef.current.add(s);
        enqueueRetrain(30, s);
      }
    }
  }, [active, startedAt, serverStep, tick, enqueueRetrain]);

  useStressNotifications({
    active,
    anomalies,
    alerts,
    stressStartedAt: startedAt,
  });

  const value = useMemo<StressTestContextValue>(
    () => ({
      active,
      isInitiator,
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
    [
      active,
      isInitiator,
      equipmentId,
      startedAt,
      endsAt,
      stressObjectId,
      objectId,
      stressPhase,
      stressStep,
      tick,
      anomalies,
      startStressTest,
      endStressTest,
    ],
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
