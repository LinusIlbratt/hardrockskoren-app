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
import { createPortal } from 'react-dom';
import { FiAlertCircle, FiCheck, FiInfo } from 'react-icons/fi';
import styles from './ToastContext.module.scss';

const DISMISS_MS = 4000;
const MAX_TOASTS = 3;

type ToastType = 'success' | 'error' | 'info';

type ToastItem = {
  id: string;
  type: ToastType;
  message: string;
};

export type ToastApi = {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

function nextToastId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const ICONS = {
  success: FiCheck,
  error: FiAlertCircle,
  info: FiInfo,
} as const;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<string, number>());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const push = useCallback((type: ToastType, message: string) => {
    const text = message.trim();
    if (!text) return;
    const id = nextToastId();
    setToasts((current) => {
      const next = [...current, { id, type, message: text }];
      if (next.length <= MAX_TOASTS) return next;
      const dropped = next.slice(0, next.length - MAX_TOASTS);
      for (const item of dropped) {
        const timer = timers.current.get(item.id);
        if (timer !== undefined) {
          window.clearTimeout(timer);
          timers.current.delete(item.id);
        }
      }
      return next.slice(next.length - MAX_TOASTS);
    });
    const timer = window.setTimeout(() => dismiss(id), DISMISS_MS);
    timers.current.set(id, timer);
  }, [dismiss]);

  useEffect(() => {
    const active = timers.current;
    return () => {
      for (const timer of active.values()) {
        window.clearTimeout(timer);
      }
      active.clear();
    };
  }, []);

  const toast = useMemo<ToastApi>(() => ({
    success: (message) => push('success', message),
    error: (message) => push('error', message),
    info: (message) => push('info', message),
  }), [push]);

  const host = document.getElementById('modal-root') ?? document.body;

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {createPortal(
        <>
          <div className={styles.live} aria-live="polite" aria-atomic="false">
            {toasts.map((item) => (
              <p key={item.id}>{item.message}</p>
            ))}
          </div>
          <div className={styles.stack}>
            {toasts.map((item) => {
              const Icon = ICONS[item.type];
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`${styles.toast} ${styles[item.type]}`}
                  onClick={() => dismiss(item.id)}
                >
                  <Icon className={styles.icon} aria-hidden size={16} />
                  <span>{item.message}</span>
                </button>
              );
            })}
          </div>
        </>,
        host,
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const toast = useContext(ToastContext);
  if (!toast) {
    throw new Error('useToast måste användas inuti ToastProvider.');
  }
  return toast;
}
