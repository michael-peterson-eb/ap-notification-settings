import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

export type ToastType = 'success' | 'error' | 'info';

export type Toast = {
  id: string;
  type: ToastType;
  title?: string;
  message?: string;
  // optional lifetime in ms (default 10000). If 0 or negative, won't auto-dismiss.
  ttl?: number;
};

type ToastContextShape = {
  toasts: Toast[];
  pushToast: (t: Omit<Toast, 'id'>) => string;
  dismissToast: (id: string) => void;
  clearToasts: () => void;
};

const ToastContext = createContext<ToastContextShape | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushToast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = String(Math.random()).slice(2);
    const toast: Toast = { ...t, id, ttl: t.ttl ?? 10000 };
    setToasts((s) => [...s, toast]);

    if (toast.ttl && toast.ttl > 0) {
      window.setTimeout(() => {
        setToasts((s) => s.filter((x) => x.id !== id));
      }, toast.ttl);
    }

    return id;
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((s) => s.filter((x) => x.id !== id));
  }, []);

  const clearToasts = useCallback(() => setToasts([]), []);

  const value = useMemo(
    () => ({
      toasts,
      pushToast,
      dismissToast,
      clearToasts,
    }),
    [toasts, pushToast, dismissToast, clearToasts]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

export function useToasts() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToasts must be used within a ToastProvider');
  return ctx;
}

/* Internal: simple toast UI rendered by provider */
function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div aria-live="polite" className="fixed top-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={[
            'rounded-md shadow px-3 py-2 text-sm flex items-start gap-3 max-w-xs',
            t.type === 'success' ? 'bg-emerald-50 ring-1 ring-emerald-200 text-emerald-900' : '',
            t.type === 'error' ? 'bg-red-50 ring-1 ring-red-200 text-red-900' : '',
            t.type === 'info' ? 'bg-zinc-50 ring-1 ring-zinc-200 text-zinc-900' : '',
          ].join(' ')}>
          <div className="flex-1">
            {t.title ? <div className="font-medium">{t.title}</div> : null}
            {t.message ? <div className="text-xs mt-0.5">{t.message}</div> : null}
          </div>
          <div>
            <button className="text-xs underline" onClick={() => onDismiss(t.id)}>
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
