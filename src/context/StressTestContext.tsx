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
  useTriggerDetection,
} from '../api/hooks';
import { useStressNotifications } from '../hooks/useStressNotifications';

const POLL_MS = 2000;
const STRESS_UI_BUFFER_MS = 60_000;

const SEVERITY_LEGEND = [
  { key: 'low', label: 'Низкий', color: '#52c41a' },
  { key: 'medium', label: 'Средний', color: '#faad14' },
  { key: 'high', label: 'Высокий', color: '#fa8c16' },
  { key: 'critical', label: 'Критический', color: '#ff4d4f' },
];

// #region agent log
const dbg = (location: string, msg: string, data: Record<string, unknown>, hypothesisId: string) => {
  fetch('http://127.0.0.1:7375/ingest/39631315-b50a-4bb0-b4d2-a2c4b21d8170', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'dc4f99' },
    body: JSON.stringify({ sessionId: 'dc4f99', location, message: msg, data, hypothesisId, timestamp: Date.now(), runId: 'post-fix' }),
  }).catch(() => {});
};
// #endregion

export interface StressTestContextValue {
  active: boolean;
  equipmentId?: string;
  startedAt?: number;
  endsAt?: number;
  objectId?: string;
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

/** Safe variant for layout chrome that may render outside provider in tests. */
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
  const endTimerRef = useRef<number | undefined>(undefined);
  const stressObjectIdRef = useRef<string | undefined>(undefined);

  const [active, setActive] = useState(false);
  const [equipmentId, setEquipmentId] = useState<string>();
  const [startedAt, setStartedAt] = useState<number>();
  const [endsAt, setEndsAt] = useState<number>();
  const [stressObjectId, setStressObjectId] = useState<string>();

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

  const endStressTest = useCallback(() => {
    const endedObjectId = stressObjectIdRef.current ?? objectId;
    // #region agent log
    dbg('StressTestContext.tsx:end', 'stress test ended', { startedAt, endedObjectId }, 'H2');
    // #endregion
    if (endTimerRef.current) {
      window.clearTimeout(endTimerRef.current);
      endTimerRef.current = undefined;
    }
    stressObjectIdRef.current = undefined;
    setActive(false);
    setEquipmentId(undefined);
    setStartedAt(undefined);
    setEndsAt(undefined);
    setStressObjectId(undefined);
    if (endedObjectId) {
      void queryClient.invalidateQueries({ queryKey: ['health-score', endedObjectId] });
      void queryClient.invalidateQueries({ queryKey: ['anomalies', endedObjectId] });
    }
  }, [startedAt, objectId, queryClient]);

  const startStressTest = useCallback(
    ({ equipmentId: eqId, objectId: objId, durationSeconds }: {
      equipmentId: string;
      objectId: string;
      durationSeconds: number;
    }) => {
      const now = Date.now();
      const end = now + durationSeconds * 1000 + STRESS_UI_BUFFER_MS;
      // #region agent log
      dbg('StressTestContext.tsx:start', 'stress test started at layout', {
        equipmentId: eqId,
        objectId: objId,
        durationSeconds,
        endsAt: end,
      }, 'H2');
      // #endregion
      if (endTimerRef.current) window.clearTimeout(endTimerRef.current);
      stressObjectIdRef.current = objId;
      setEquipmentId(eqId);
      setStressObjectId(objId);
      setStartedAt(now);
      setEndsAt(end);
      setActive(true);
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

  const handleAutoMl = useCallback(async () => {
    const targetId = stressObjectId ?? objectId;
    if (!targetId) return;
    try {
      const result = await detectMutation.mutateAsync({ object_id: targetId, days: 1 });
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
      startStressTest,
      endStressTest,
    }),
    [active, equipmentId, startedAt, endsAt, stressObjectId, objectId, startStressTest, endStressTest],
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
