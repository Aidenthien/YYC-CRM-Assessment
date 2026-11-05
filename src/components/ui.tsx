"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { ContactStatus, OpportunityStage, ActivityType } from "@/types";

export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={`animate-spin text-indigo-600 ${className}`} viewBox="0 0 24 24" fill="none" role="status" aria-label="Loading">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function LoadingBlock({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-sm text-zinc-500">
      <Spinner /> {label}
    </div>
  );
}

export function ErrorBanner({ message, onRetry, onDismiss }: { message: string; onRetry?: () => void; onDismiss?: () => void }) {
  return (
    <div role="alert" className="flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
      <span>{message}</span>
      <span className="flex shrink-0 gap-3">
        {onRetry && <button onClick={onRetry} className="font-medium underline">Retry</button>}
        {onDismiss && <button onClick={onDismiss} aria-label="Dismiss" className="font-medium">&times;</button>}
      </span>
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
      <div className="text-base font-medium text-zinc-800 dark:text-zinc-200">{title}</div>
      {hint && <p className="max-w-sm text-sm text-zinc-500">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-zinc-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="modal-title"
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl border border-zinc-200 bg-white p-0 text-zinc-900 shadow-xl backdrop:bg-black/50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
    >
      <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
        <h2 id="modal-title" className="text-base font-semibold">{title}</h2>
        <button onClick={onClose} aria-label="Close" className="btn-ghost !px-2 !py-1 text-lg leading-none">&times;</button>
      </div>
      <div className="p-5">{children}</div>
    </dialog>
  );
}

export function ConfirmModal({ title, message, confirmLabel = "Delete", busy, error, onConfirm, onClose }: {
  title: string; message: string; confirmLabel?: string; busy?: boolean; error?: string | null; onConfirm: () => void; onClose: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{message}</p>
      {error && <div className="mt-3"><ErrorBanner message={error} /></div>}
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-danger" onClick={onConfirm} disabled={busy}>{busy ? "Working..." : confirmLabel}</button>
      </div>
    </Modal>
  );
}

export function Field({ label, error, children, htmlFor }: { label: string; error?: string; children: ReactNode; htmlFor: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="label">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

const statusStyles: Record<ContactStatus, string> = {
  Lead: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  Prospect: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  Customer: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
};
export function StatusBadge({ status }: { status: ContactStatus }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[status] ?? ""}`}>{status}</span>;
}

export const stageStyles: Record<OpportunityStage, string> = {
  New: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  Contacted: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  Qualified: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  Proposal: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  Won: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  Lost: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};
export function StageBadge({ stage }: { stage: OpportunityStage }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${stageStyles[stage] ?? ""}`}>{stage}</span>;
}

const activityStyles: Record<ActivityType, { cls: string; icon: string }> = {
  Call: { cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300", icon: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" },
  Email: { cls: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300", icon: "M3 6h18v12H3zM3 7l9 6 9-6" },
  Meeting: { cls: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300", icon: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4" },
  Note: { cls: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300", icon: "M6 3h9l4 4v14H6zM9 12h7M9 16h7" },
};
export function ActivityIcon({ type }: { type: ActivityType }) {
  const s = activityStyles[type] ?? activityStyles.Note;
  return (
    <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${s.cls}`} title={type}>
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={s.icon} />
      </svg>
      <span className="sr-only">{type}</span>
    </span>
  );
}
