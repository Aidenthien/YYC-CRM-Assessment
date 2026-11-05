"use client";

import { Fragment, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { ChatSessionSummary } from "@/types";
import { useApi } from "./useApi";
import { ConfirmModal, ErrorBanner, Spinner } from "./ui";

const DAY = 86_400_000;

function groupOf(iso: string): string {
  const d = new Date(iso);
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  const diff = startToday.getTime() - d.getTime();
  if (diff <= 0) return "Today";
  if (diff <= DAY) return "Yesterday";
  if (diff <= 7 * DAY) return "Previous 7 days";
  return "Older";
}
const GROUPS = ["Today", "Yesterday", "Previous 7 days", "Older"];

function Highlight({ text, term }: { text: string; term: string }) {
  if (!term) return <>{text}</>;
  const lower = text.toLowerCase();
  const t = term.toLowerCase();
  const out: React.ReactNode[] = [];
  let i = 0;
  while (i < text.length) {
    const j = lower.indexOf(t, i);
    if (j < 0) { out.push(text.slice(i)); break; }
    if (j > i) out.push(text.slice(i, j));
    out.push(<mark key={j} className="rounded bg-yellow-200 px-0.5 text-inherit dark:bg-yellow-700/60">{text.slice(j, j + t.length)}</mark>);
    i = j + t.length;
  }
  return <>{out.map((n, k) => <Fragment key={k}>{n}</Fragment>)}</>;
}

export default function ChatHistory({ contactId, activeId, refreshKey, onSelect, onNew, onDeleted, className = "" }: {
  contactId?: string;
  activeId: string | null;
  refreshKey: number;
  onSelect: (s: ChatSessionSummary) => void;
  onNew: () => void;
  onDeleted: (id: string) => void;
  className?: string;
}) {
  const [input, setInput] = useState("");
  const [term, setTerm] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState<ChatSessionSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setTerm(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input]);

  const params = new URLSearchParams({ limit: "100" });
  if (term) params.set("q", term);
  if (contactId) params.set("contact_id", contactId);
  const list = useApi<ChatSessionSummary[]>(`/api/rag/sessions?${params}&r=${refreshKey}`);

  async function saveRename() {
    if (!renaming) return;
    const title = renaming.title.trim();
    if (!title) return setRenaming(null);
    setErr(null);
    try {
      await api.renameChatSession(renaming.id, title);
      setRenaming(null);
      list.reload();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    setErr(null);
    try {
      await api.deleteChatSession(deleting.id);
      onDeleted(deleting.id);
      setDeleting(null);
      list.reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const sessions = list.data ?? [];
  const grouped = GROUPS.map((g) => ({ g, items: sessions.filter((s) => groupOf(s.updated_at) === g) })).filter((x) => x.items.length);

  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      <div className="space-y-2 border-b border-zinc-200 p-3 dark:border-zinc-800">
        <button type="button" className="btn-primary w-full" onClick={onNew}>+ New chat</button>
        <label htmlFor="chat-search" className="sr-only">Search chats</label>
        <input id="chat-search" type="search" className="input" placeholder="Search past chats..." value={input} onChange={(e) => setInput(e.target.value)} />
      </div>
      {(err || list.error) && <div className="p-3"><ErrorBanner message={(err ?? list.error)!} onRetry={list.reload} onDismiss={err ? () => setErr(null) : undefined} /></div>}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {list.loading && !list.data ? (
          <div className="flex justify-center p-6"><Spinner /></div>
        ) : sessions.length === 0 ? (
          <p className="p-4 text-center text-sm text-zinc-500">{term ? `No chats match "${term}".` : "No past chats yet."}</p>
        ) : (
          grouped.map(({ g, items }) => (
            <div key={g}>
              <h3 className="sticky top-0 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">{g}</h3>
              <ul>
                {items.map((s) => (
                  <li key={s.id} className={`group border-l-2 ${s.id === activeId ? "border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40" : "border-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800/50"}`}>
                    {renaming?.id === s.id ? (
                      <form className="flex gap-1 p-2" onSubmit={(e) => { e.preventDefault(); void saveRename(); }}>
                        <input autoFocus className="input !py-1 text-sm" aria-label="Chat title" maxLength={120} value={renaming.title} onChange={(e) => setRenaming({ id: s.id, title: e.target.value })} onKeyDown={(e) => e.key === "Escape" && setRenaming(null)} />
                        <button type="submit" className="btn-primary !px-2 !py-1 text-xs">Save</button>
                      </form>
                    ) : (
                      <div className="flex items-start gap-1 px-3 py-2">
                        <button type="button" onClick={() => onSelect(s)} className="min-w-0 flex-1 text-left" aria-current={s.id === activeId}>
                          <span className="block truncate text-sm font-medium"><Highlight text={s.title} term={term} /></span>
                          {s.match_snippet ? (
                            <span className="mt-0.5 block text-xs text-zinc-500"><Highlight text={s.match_snippet} term={term} /></span>
                          ) : s.last_question ? (
                            <span className="mt-0.5 block truncate text-xs text-zinc-500">{s.last_question}</span>
                          ) : null}
                          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
                            {s.contact_name && <span className="rounded-full bg-indigo-100 px-2 py-0.5 font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">{s.contact_name}</span>}
                            <span>{s.message_count} {s.message_count === 1 ? "message" : "messages"}</span>
                          </span>
                        </button>
                        <div className="flex shrink-0 gap-0.5 opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                          <button type="button" className="rounded px-1.5 py-1 text-xs text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700" onClick={() => setRenaming({ id: s.id, title: s.title })} aria-label={`Rename ${s.title}`}>Rename</button>
                          <button type="button" className="rounded px-1.5 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40" onClick={() => setDeleting(s)} aria-label={`Delete ${s.title}`}>Delete</button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
      {deleting && (
        <ConfirmModal
          title="Delete chat"
          message={`Delete "${deleting.title}" and its ${deleting.message_count} message(s)? This cannot be undone.`}
          busy={busy}
          onConfirm={confirmDelete}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
