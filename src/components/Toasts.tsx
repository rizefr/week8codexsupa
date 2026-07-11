import { useEffect } from "react";
import { CheckCircle2, Dumbbell, Flame } from "./icons";

export type ToastTone = "pr" | "badge" | "level";

export interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  detail?: string;
}

const toneIcons = {
  pr: Dumbbell,
  badge: CheckCircle2,
  level: Flame,
} as const;

function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const timeout = window.setTimeout(() => onDismiss(toast.id), 4500);
    return () => window.clearTimeout(timeout);
  }, [toast.id, onDismiss]);
  const Icon = toneIcons[toast.tone];
  return (
    <button className={`toast tone-${toast.tone}`} onClick={() => onDismiss(toast.id)} type="button">
      <span className="toast-icon"><Icon size={18} /></span>
      <span>
        <strong>{toast.title}</strong>
        {toast.detail && <small>{toast.detail}</small>}
      </span>
    </button>
  );
}

export function ToastStack({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
  if (!toasts.length) return null;
  return (
    <div className="toast-stack" aria-live="polite" aria-label="Recent achievements">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
