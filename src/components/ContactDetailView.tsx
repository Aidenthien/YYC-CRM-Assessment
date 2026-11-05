"use client";

import Link from "next/link";
import { useState } from "react";
import { api, type ContactDetail, type RagHistoryItem } from "@/lib/api";
import type { ChatSessionSummary, Opportunity } from "@/types";
import { useApi } from "./useApi";
import { formatDate, formatRM, relativeTime } from "./format";
import { ContactFormModal, LogActivityForm, OpportunityFormModal } from "./forms";
import TaxChat, { AnswerView } from "./TaxChat";
import { ActivityIcon, EmptyState, ErrorBanner, LoadingBlock, StageBadge, StatusBadge } from "./ui";

export default function ContactDetailView({ id }: { id: string }) {
  const { data: c, error, loading, reload } = useApi<ContactDetail>(`/api/contacts/${id}`);
  const history = useApi<RagHistoryItem[]>(`/api/rag/history?contact_id=${encodeURIComponent(id)}&limit=20`);
  const sessions = useApi<ChatSessionSummary[]>(`/api/rag/sessions?contact_id=${encodeURIComponent(id)}&limit=50`);
  const [chatSid, setChatSid] = useState(""); // "" => new chat
  const [chatKey, setChatKey] = useState(0);
  const [editContact, setEditContact] = useState(false);
  const [oppModal, setOppModal] = useState<Opportunity | "new" | null>(null);
  const [actError, setActError] = useState<string | null>(null);

  async function removeActivity(actId: string) {
    setActError(null);
    try {
      await api.deleteActivity(actId);
      reload();
    } catch (e) {
      setActError((e as Error).message);
    }
  }

  if (loading && !c) return <LoadingBlock />;
  if (error && !c) {
    return (
      <div className="space-y-4">
        <Link href="/contacts" className="text-sm text-indigo-600 hover:underline">&larr; Back to contacts</Link>
        <ErrorBanner message={error} onRetry={reload} />
      </div>
    );
  }
  if (!c) return null;

  return (
    <div className="space-y-6">
      <Link href="/contacts" className="text-sm text-indigo-600 hover:underline dark:text-indigo-400">&larr; Back to contacts</Link>

      <section className="card flex flex-wrap items-start justify-between gap-4 p-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{c.name}</h1>
            <StatusBadge status={c.status} />
          </div>
          <dl className="mt-3 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-3">
            <div><dt className="text-xs text-zinc-500">Company</dt><dd>{c.company ?? "-"}</dd></div>
            <div><dt className="text-xs text-zinc-500">Email</dt><dd className="break-all">{c.email ?? "-"}</dd></div>
            <div><dt className="text-xs text-zinc-500">Phone</dt><dd>{c.phone ?? "-"}</dd></div>
          </dl>
        </div>
        <button className="btn-secondary" onClick={() => setEditContact(true)}>Edit</button>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <section className="card">
            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
              <h2 className="text-base font-semibold">Opportunities</h2>
              <button className="btn-secondary !py-1" onClick={() => setOppModal("new")}>+ Add</button>
            </div>
            {c.opportunities.length === 0 ? (
              <EmptyState title="No opportunities" hint="Add one to start tracking this deal." />
            ) : (
              <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {c.opportunities.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{o.title}</div>
                      <div className="text-xs text-zinc-500">{formatRM(o.value_rm)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StageBadge stage={o.stage} />
                      <button className="btn-ghost !px-2 !py-1" onClick={() => setOppModal(o)} aria-label={`Edit ${o.title}`}>Edit</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <h2 className="border-b border-zinc-200 px-5 py-3 text-base font-semibold dark:border-zinc-800">Activity</h2>
            <div className="border-b border-zinc-200 p-5 dark:border-zinc-800">
              <LogActivityForm contactId={c.id} onLogged={reload} />
            </div>
            {actError && <div className="px-5 pt-3"><ErrorBanner message={actError} onDismiss={() => setActError(null)} /></div>}
            {c.activities.length === 0 ? (
              <EmptyState title="No activity logged" hint="Log a call, email, meeting or note above." />
            ) : (
              <ol className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {c.activities.map((a) => (
                  <li key={a.id} className="flex items-start gap-3 px-5 py-3">
                    <ActivityIcon type={a.type} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{a.description}</p>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {a.type} · {formatDate(a.activity_date)} ({relativeTime(a.activity_date)})
                      </p>
                    </div>
                    <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => removeActivity(a.id)} aria-label="Delete activity">Delete</button>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section className="card flex h-[34rem] flex-col">
            <div className="border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
              <h2 className="text-base font-semibold">Ask a tax question about this client</h2>
              <p className="text-xs text-zinc-500">Answers use {c.name}&apos;s CRM context and are saved to their history.</p>
            </div>
            <div className="flex items-center gap-2 border-b border-zinc-200 px-5 py-2 dark:border-zinc-800">
              <label htmlFor="contact-chat" className="shrink-0 text-xs font-medium text-zinc-500">Chat</label>
              <select
                id="contact-chat"
                className="input !py-1 text-sm"
                value={chatSid}
                onChange={(e) => { setChatSid(e.target.value); setChatKey((k) => k + 1); }}
              >
                <option value="">New chat</option>
                {(sessions.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>{s.title} ({s.message_count})</option>
                ))}
              </select>
            </div>
            <TaxChat
              key={chatKey}
              className="flex-1"
              contactId={c.id}
              contactLabel={c.name}
              sessionId={chatSid || null}
              onSessionChange={setChatSid}
              onAnswered={() => { history.reload(); sessions.reload(); }}
            />
          </section>

          <section className="card">
            <h2 className="border-b border-zinc-200 px-5 py-3 text-base font-semibold dark:border-zinc-800">Past tax Q&amp;A</h2>
            {history.error && <div className="p-4"><ErrorBanner message={history.error} onRetry={history.reload} /></div>}
            {history.loading && !history.data ? (
              <LoadingBlock />
            ) : history.data && history.data.length === 0 ? (
              <EmptyState title="No questions yet" hint="Questions asked for this client will appear here." />
            ) : (
              <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {(history.data ?? []).map((h) => (
                  <li key={h.id}>
                    <details className="group px-5 py-3">
                      <summary className="cursor-pointer list-none text-sm font-medium">
                        {h.question}
                        <span className="ml-2 text-xs font-normal text-zinc-500">{relativeTime(h.created_at)}</span>
                      </summary>
                      <div className="mt-3">
                        <AnswerView uid={`h${h.id}`} answer={h.answer} answerable={h.answerable} citations={h.citations ?? []} />
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {editContact && (
        <ContactFormModal contact={c} onClose={() => setEditContact(false)} onSaved={() => { setEditContact(false); reload(); }} />
      )}
      {oppModal && (
        <OpportunityFormModal
          opportunity={oppModal === "new" ? undefined : oppModal}
          fixedContactId={c.id}
          onClose={() => setOppModal(null)}
          onSaved={() => { setOppModal(null); reload(); }}
        />
      )}
    </div>
  );
}
