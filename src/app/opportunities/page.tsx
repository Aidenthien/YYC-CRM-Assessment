"use client";

import { useState, type DragEvent } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { OPPORTUNITY_STAGES } from "@/types";
import type { Opportunity, OpportunityStage } from "@/types";
import { useApi } from "@/components/useApi";
import { formatRM } from "@/components/format";
import { OpportunityFormModal } from "@/components/forms";
import { ConfirmModal, ErrorBanner, LoadingBlock, PageHeader, stageStyles } from "@/components/ui";

export default function OpportunitiesPage() {
  const { data, error, loading, reload, mutate } = useApi<Opportunity[]>("/api/opportunities");
  const [modal, setModal] = useState<Opportunity | "new" | null>(null);
  const [deleting, setDeleting] = useState<Opportunity | null>(null);
  const [delBusy, setDelBusy] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<OpportunityStage | null>(null);

  async function move(id: string, stage: OpportunityStage) {
    const current = data?.find((o) => o.id === id);
    if (!current || current.stage === stage) return;
    const prev = current.stage;
    setMoveError(null);
    mutate((list) => list.map((o) => (o.id === id ? { ...o, stage } : o)));
    try {
      await api.updateOpportunity(id, { stage });
    } catch (e) {
      mutate((list) => list.map((o) => (o.id === id ? { ...o, stage: prev } : o)));
      setMoveError(`Could not move "${current.title}": ${(e as Error).message}`);
    }
  }

  function onDrop(e: DragEvent, stage: OpportunityStage) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain") || dragId;
    setOverStage(null);
    setDragId(null);
    if (id) void move(id, stage);
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDelBusy(true);
    try {
      await api.deleteOpportunity(deleting.id);
      mutate((list) => list.filter((o) => o.id !== deleting.id));
      setDeleting(null);
    } catch (e) {
      setMoveError((e as Error).message);
      setDeleting(null);
    } finally {
      setDelBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Opportunities"
        subtitle="Drag cards between columns, or use the stage menu on each card."
        actions={<button className="btn-primary" onClick={() => setModal("new")}>+ New opportunity</button>}
      />
      {error && <div className="mb-4"><ErrorBanner message={error} onRetry={reload} /></div>}
      {moveError && <div className="mb-4"><ErrorBanner message={moveError} onDismiss={() => setMoveError(null)} /></div>}
      {loading && !data ? (
        <LoadingBlock />
      ) : data ? (
        <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
          <div className="grid min-w-max grid-cols-6 gap-3 lg:min-w-0">
            {OPPORTUNITY_STAGES.map((stage) => {
              const items = data.filter((o) => o.stage === stage);
              const total = items.reduce((s, o) => s + Number(o.value_rm), 0);
              return (
                <section
                  key={stage}
                  aria-label={`${stage} column`}
                  onDragOver={(e) => { e.preventDefault(); setOverStage(stage); }}
                  onDragLeave={() => setOverStage((s) => (s === stage ? null : s))}
                  onDrop={(e) => onDrop(e, stage)}
                  className={`flex w-60 flex-col rounded-xl border bg-zinc-100/70 p-2 lg:w-auto dark:bg-zinc-900/60 ${
                    overStage === stage ? "border-indigo-500 ring-2 ring-indigo-500/30" : "border-zinc-200 dark:border-zinc-800"
                  }`}
                >
                  <header className="px-2 pb-2 pt-1">
                    <div className="flex items-center justify-between">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${stageStyles[stage]}`}>{stage}</span>
                      <span className="text-xs text-zinc-500">{items.length}</span>
                    </div>
                    <div className="mt-1 text-sm font-semibold tabular-nums">{formatRM(total)}</div>
                  </header>
                  <ul className="flex min-h-24 flex-1 flex-col gap-2">
                    {items.map((o) => (
                      <li
                        key={o.id}
                        draggable
                        onDragStart={(e) => { e.dataTransfer.setData("text/plain", o.id); e.dataTransfer.effectAllowed = "move"; setDragId(o.id); }}
                        onDragEnd={() => { setDragId(null); setOverStage(null); }}
                        className={`card cursor-grab p-3 active:cursor-grabbing ${dragId === o.id ? "opacity-40" : ""}`}
                      >
                        <div className="text-sm font-medium leading-snug">{o.title}</div>
                        <div className="mt-1 text-sm font-semibold tabular-nums text-indigo-600 dark:text-indigo-400">{formatRM(o.value_rm)}</div>
                        {o.contact && (
                          <Link href={`/contacts/${o.contact.id}`} className="mt-1 block truncate text-xs text-zinc-500 hover:underline">
                            {o.contact.name}{o.contact.company ? ` · ${o.contact.company}` : ""}
                          </Link>
                        )}
                        <div className="mt-2 flex items-center gap-1">
                          <label className="sr-only" htmlFor={`stage-${o.id}`}>Stage for {o.title}</label>
                          <select
                            id={`stage-${o.id}`}
                            className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-1.5 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                            value={o.stage}
                            onChange={(e) => move(o.id, e.target.value as OpportunityStage)}
                          >
                            {OPPORTUNITY_STAGES.map((s) => <option key={s}>{s}</option>)}
                          </select>
                          <button className="btn-ghost !px-1.5 !py-1 text-xs" onClick={() => setModal(o)} aria-label={`Edit ${o.title}`}>Edit</button>
                          <button className="btn-ghost !px-1.5 !py-1 text-xs text-red-600 dark:text-red-400" onClick={() => setDeleting(o)} aria-label={`Delete ${o.title}`}>Del</button>
                        </div>
                      </li>
                    ))}
                    {items.length === 0 && <li className="rounded-lg border border-dashed border-zinc-300 p-4 text-center text-xs text-zinc-400 dark:border-zinc-700">Drop here</li>}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      ) : null}
      {modal && (
        <OpportunityFormModal
          opportunity={modal === "new" ? undefined : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); reload(); }}
        />
      )}
      {deleting && (
        <ConfirmModal
          title="Delete opportunity"
          message={`Delete "${deleting.title}"? This cannot be undone.`}
          busy={delBusy}
          onConfirm={confirmDelete}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}
