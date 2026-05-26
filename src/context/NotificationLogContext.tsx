import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { NotificationLogEntry } from '../utils/notificationLogUtils';

interface NotificationLogContextValue {
  entries: NotificationLogEntry[];
  addEntry: (entry: NotificationLogEntry) => void;
  clearLog: () => void;
  selectedEntry: NotificationLogEntry | null;
  openDetail: (entry: NotificationLogEntry) => void;
  closeDetail: () => void;
}

const NotificationLogContext = createContext<NotificationLogContextValue | null>(null);

export function useNotificationLog() {
  const ctx = useContext(NotificationLogContext);
  if (!ctx) throw new Error('useNotificationLog must be used within NotificationLogProvider');
  return ctx;
}

export function useNotificationLogOptional() {
  return useContext(NotificationLogContext);
}

interface NotificationLogProviderProps {
  children: ReactNode;
}

export function NotificationLogProvider({ children }: NotificationLogProviderProps) {
  const [entries, setEntries] = useState<NotificationLogEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<NotificationLogEntry | null>(null);

  const addEntry = useCallback((entry: NotificationLogEntry) => {
    setEntries((prev) => {
      if (prev.some((e) => e.id === entry.id)) return prev;
      return [...prev, entry].sort((a, b) => a.timestamp - b.timestamp);
    });
  }, []);

  const clearLog = useCallback(() => {
    setEntries([]);
    setSelectedEntry(null);
  }, []);

  const openDetail = useCallback((entry: NotificationLogEntry) => {
    setSelectedEntry(entry);
  }, []);

  const closeDetail = useCallback(() => {
    setSelectedEntry(null);
  }, []);

  const value = useMemo(
    () => ({ entries, addEntry, clearLog, selectedEntry, openDetail, closeDetail }),
    [entries, addEntry, clearLog, selectedEntry, openDetail, closeDetail],
  );

  return (
    <NotificationLogContext.Provider value={value}>
      {children}
    </NotificationLogContext.Provider>
  );
}
