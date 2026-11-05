"use client";

import { Fragment, useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import type { Citation } from "@/types";
import { ErrorBanner, Spinner } from "./ui";

export const EXAMPLE_QUESTIONS = [
  "What is the corporate income tax rate for SMEs?",
  "Is a sole proprietor required to register for SST?",
  "What are the deadlines for filing Form BE?",
  "Can I claim a deduction for entertainment expenses?",
];

function pages(c: Citation) {
  if (c.page_start == null) return null;
  return c.page_end != null && c.page_end !== c.page_start ? `pp. ${c.page_start}-${c.page_end}` : `p. ${c.page_start}`;
}

/** Renders answer text with [n] markers as citation chips + a Sources list. */
export function AnswerView({ uid, answer, answerable, citations }: { uid: string; answer: string; answerable: boolean; citations: Citation[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const byN = new Map(citations.map((c) => [c.n, c]));
  const parts = answer.split(/(\[\d+(?:\s*,\s*\d+)*\])/g);

  function jump(n: number) {
    setOpen(n);
    document.getElementById(`${uid}-src-${n}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  return (
    <div className="space-y-3">
      {!answerable && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
          <span aria-hidden="true">&#9888;</span> Not found in the knowledge base
        </div>
      )}
      <p className="whitespace-pre-wrap text-sm leading-relaxed">
        {parts.map((p, i) => {
          const m = p.match(/^\[(\d+(?:\s*,\s*\d+)*)\]$/);
          if (!m) return <Fragment key={i}>{p}</Fragment>;
          return (
            <Fragment key={i}>
              {m[1].split(",").map((s) => {
                const n = Number(s.trim());
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => jump(n)}
                    title={byN.get(n)?.document_name ?? `Source ${n}`}
                    className="mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-100 px-1.5 align-text-top text-xs font-semibold text-indigo-700 hover:bg-indigo-200 dark:bg-indigo-950 dark:text-indigo-300"
                  >
                    {n}
                  </button>
                );
              })}
            </Fragment>
          );
        })}
      </p>
      {citations.length > 0 && (
        <div>
          <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">Sources</h4>
          <ol className="space-y-1.5">
            {citations.map((c) => (
              <li key={c.n} id={`${uid}-src-${c.n}`} className="rounded-lg border border-zinc-200 text-sm dark:border-zinc-800">
                <div className="flex items-start gap-2 px-3 py-2">
                  <span className="mt-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-100 px-1.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">{c.n}</span>
                  <div className="min-w-0 flex-1">
                    <a href={c.source_url} target="_blank" rel="noopener noreferrer" className="font-medium text-indigo-700 hover:underline dark:text-indigo-300">
                      {c.document_name}
                    </a>
                    <div className="text-xs text-zinc-500">
                      {[pages(c), c.section].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                    aria-expanded={open === c.n}
                    onClick={() => setOpen(open === c.n ? null : c.n)}
                  >
                    {open === c.n ? "Hide excerpt" : "Show excerpt"}
                  </button>
                </div>
                {open === c.n && (
                  <blockquote className="border-t border-zinc-200 bg-zinc-50 px-3 py-2 text-xs leading-relaxed text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                    {c.excerpt}
                  </blockquote>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

interface Message {
  id: number;
  question: string;
  status: "loading" | "done" | "error";
  answer?: string;
  answerable?: boolean;
  citations?: Citation[];
  error?: string;
}

export default function TaxChat({ contactId, category, contactLabel, sessionId, onSessionChange, onAnswered, className = "" }: {
  contactId?: string;
  category?: string;
  contactLabel?: string;
  /** Reopen this saved chat on mount (remount with a new key to switch chats). */
  sessionId?: string | null;
  /** Called with the session id once the first answer creates a new session. */
  onSessionChange?: (id: string) => void;
  onAnswered?: () => void;
  className?: string;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [seq, setSeq] = useState(1);
  const [sid, setSid] = useState<string | null>(sessionId ?? null);
  const [loadingChat, setLoadingChat] = useState(!!sessionId);
  const [loadError, setLoadError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const busy = loadingChat || messages.some((m) => m.status === "loading");

  const initialSession = useRef(sessionId); // only load on mount; later prop changes come from our own onSessionChange
  useEffect(() => {
    const sessionId = initialSession.current;
    if (!sessionId) return;
    let cancelled = false;
    api
      .chatSession(sessionId)
      .then((d) => {
        if (cancelled) return;
        setMessages(d.messages.map((m, i) => ({ id: -(i + 1), question: m.question, status: "done" as const, answer: m.answer, answerable: m.answerable, citations: m.citations })));
        setLoadingChat(false);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setLoadError(e.message);
        setLoadingChat(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  async function ask(q: string) {
    const question = q.trim();
    if (!question || busy) return;
    const id = seq;
    setSeq(id + 1);
    setInput("");
    setMessages((m) => [...m, { id, question, status: "loading" }]);
    try {
      const r = await api.ask({ question, contact_id: contactId, category: category || undefined, session_id: sid ?? undefined });
      if (r.session_id && r.session_id !== sid) {
        setSid(r.session_id);
        onSessionChange?.(r.session_id);
      }
      setMessages((m) =>
        m.map((x) => (x.id === id ? { ...x, status: "done", answer: r.answer, answerable: r.answerable, citations: r.citations } : x)),
      );
      onAnswered?.();
    } catch (e) {
      setMessages((m) => m.map((x) => (x.id === id ? { ...x, status: "error", error: (e as Error).message } : x)));
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void ask(input);
  }

  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      <div className="flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
        {loadingChat && <div className="flex justify-center py-6"><Spinner /></div>}
        {loadError && <ErrorBanner message={loadError} />}
        {messages.length === 0 && !loadingChat && !loadError && (
          <div className="py-6 text-center">
            <p className="text-sm text-zinc-500">
              {contactLabel ? `Ask a tax question about ${contactLabel}.` : "Ask a question about Malaysian tax."} Answers are grounded in the knowledge base with citations.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {EXAMPLE_QUESTIONS.map((q) => (
                <button key={q} type="button" onClick={() => ask(q)} className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className="space-y-2">
            <div className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-indigo-600 px-3.5 py-2 text-sm text-white">{m.question}</div>
            </div>
            <div className="max-w-full rounded-2xl rounded-bl-sm border border-zinc-200 bg-zinc-50 px-3.5 py-3 dark:border-zinc-800 dark:bg-zinc-950">
              {m.status === "loading" && (
                <div className="flex items-center gap-2 text-sm text-zinc-500"><Spinner className="h-4 w-4" /> Searching the knowledge base...</div>
              )}
              {m.status === "error" && <ErrorBanner message={m.error ?? "Something went wrong."} />}
              {m.status === "done" && (
                <AnswerView uid={`m${m.id}`} answer={m.answer ?? ""} answerable={m.answerable ?? true} citations={m.citations ?? []} />
              )}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form onSubmit={submit} className="flex gap-2 border-t border-zinc-200 p-3 dark:border-zinc-800">
        <label htmlFor={`q-${contactId ?? "g"}`} className="sr-only">Your question</label>
        <input
          id={`q-${contactId ?? "g"}`}
          className="input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your tax question..."
          disabled={busy}
        />
        <button type="submit" className="btn-primary" disabled={busy || !input.trim()}>
          {busy ? <Spinner className="h-4 w-4 text-white" /> : "Ask"}
        </button>
      </form>
    </div>
  );
}
