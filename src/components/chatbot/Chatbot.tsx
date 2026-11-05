"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { assistantApi, DATA_CHANGED_EVENT, type ChatResponse, type ContactRef, type Proposal, type ProposalView } from "@/lib/assistantApi";
import ProposalCard, { type ProposalState } from "./ProposalCard";

interface Msg {
  id: string;
  role: "user" | "assistant";
  content: string;
  proposal?: ProposalView;
  pstate?: ProposalState;
  perror?: string | null;
  link?: { href: string; label: string };
  duplicate?: ContactRef;
  candidates?: ContactRef[];
  canReuse?: boolean; // duplicate found while an opportunity is pending
  error?: boolean;
}

const WELCOME: Msg = {
  id: "welcome",
  role: "assistant",
  content: "Hi, I'm the YYC Assistant. Tell me about a contact or an opportunity in plain words and I'll fill in the form for you. You always confirm before anything is saved.",
};
const STORE_KEY = "yyc-assistant-v1";
const CHIPS: { label: string; send?: string; fill?: string }[] = [
  { label: "Add a new contact", send: "Add a new contact" },
  { label: "Create an opportunity", send: "Create an opportunity" },
  { label: "Sarah Tan, sarah@acme.com, Acme", fill: "Add Sarah Tan, sarah@acme.com, 012-345 6789, Acme Sdn Bhd, Prospect" },
  { label: "RM 50,000 deal for Daniel Lim", fill: 'Create an opportunity "Website redesign" worth RM 50,000 for Daniel Lim' },
];

const KEYFRAMES = `
@keyframes yyc-pop { from { opacity: 0; transform: translateY(6px) scale(.98); } to { opacity: 1; transform: none; } }
.yyc-pop { animation: yyc-pop 180ms ease-out both; }
@media (prefers-reduced-motion: reduce) { .yyc-pop { animation: none; } }`;

const Icon = ({ d, className = "h-6 w-6" }: { d: string; className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
const CHAT_ICON = "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12zM8.5 11h.01M12 11h.01M15.5 11h.01";
const CLOSE_ICON = "M6 6l12 12M18 6L6 18";
const SPARK = "M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z";

export default function Chatbot() {
  const router = useRouter();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(true); // the welcome message counts as unread until first open
  const [messages, setMessages] = useState<Msg[]>([WELCOME]);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const seq = useRef(0);
  const nid = () => `m${Date.now().toString(36)}${seq.current++}`;

  // Restore the session's conversation (sessionStorage can throw/be empty: always optional).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (Array.isArray(s.messages) && s.messages.length) {
          setMessages(s.messages.map((m: Msg) => (m.pstate === "saving" ? { ...m, pstate: "pending" } : m)));
          setDraft(s.draft ?? {});
          setUnread(false);
        }
      }
    } catch { /* ignore */ }
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify({ messages: messages.slice(-60), draft })); } catch { /* ignore */ }
  }, [messages, draft, hydrated]);

  // Auto-scroll to the newest message.
  useEffect(() => {
    const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    endRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "end" });
  }, [messages, busy, open]);

  const openPanel = useCallback(() => {
    setOpen(true);
    setUnread(false);
    requestAnimationFrame(() => taRef.current?.focus());
  }, []);
  const closePanel = useCallback(() => {
    setOpen(false);
    launcherRef.current?.focus(); // return focus to the launcher
  }, []);

  const patch = (id: string, p: Partial<Msg>) => setMessages((ms) => ms.map((m) => (m.id === id ? { ...m, ...p } : m)));

  async function send(text: string, base: Msg[] = messages) {
    const content = text.trim();
    if (!content || busy) return;
    const userMsg: Msg = { id: nid(), role: "user", content };
    // A newer turn replaces any still-pending confirmation card.
    const next = [...base.map((m) => (m.pstate === "pending" ? { ...m, pstate: "superseded" as const } : m)), userMsg];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const turns = next.filter((m) => m.id !== "welcome" && !m.error).map((m) => ({ role: m.role, content: m.content }));
      const r: ChatResponse = await assistantApi.chat(turns, draft);
      setDraft(r.status === "info" && !Object.keys(r.draft ?? {}).length ? {} : r.draft ?? {});
      setMessages((ms) => [
        ...ms,
        {
          id: nid(), role: "assistant", content: r.reply, link: r.link, duplicate: r.duplicate, candidates: r.candidates,
          canReuse: r.status === "duplicate" && !!(r.draft as { wants?: { opportunity?: boolean } })?.wants?.opportunity,
          ...(r.proposal ? { proposal: r.proposal, pstate: "pending" as const } : {}),
        },
      ]);
    } catch (e) {
      setMessages((ms) => [...ms, { id: nid(), role: "assistant", content: e instanceof Error ? e.message : "Something went wrong. Please try again.", error: true }]);
    } finally {
      setBusy(false);
      requestAnimationFrame(() => taRef.current?.focus());
    }
  }

  async function confirm(m: Msg, proposal: Proposal) {
    patch(m.id, { pstate: "saving", perror: null });
    try {
      const r = await assistantApi.commit(proposal);
      const what = r.kind === "both" ? `Saved ${r.contact?.name} and the opportunity "${r.opportunity?.title}".`
        : r.kind === "contact" ? `Saved contact ${r.contact?.name}.` : `Saved opportunity "${r.opportunity?.title}".`;
      patch(m.id, { pstate: "saved" });
      setMessages((ms) => [...ms, { id: nid(), role: "assistant", content: `${what} Anything else?`, link: r.link }]);
      setDraft({});
      window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT, { detail: { kind: r.kind } }));
      router.refresh();
    } catch (e) {
      patch(m.id, { pstate: "pending", perror: e instanceof Error ? e.message : "Could not save. Please try again." });
    }
  }

  function cancel(m: Msg) {
    patch(m.id, { pstate: "cancelled" });
    setDraft({});
    setMessages((ms) => [...ms, { id: nid(), role: "assistant", content: "Cancelled, nothing was saved. What would you like to add?" }]);
  }

  function reset() {
    setMessages([{ ...WELCOME }]);
    setDraft({});
    setInput("");
    try { sessionStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
    taRef.current?.focus();
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send(input);
    }
  }
  function onPanelKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") { e.stopPropagation(); closePanel(); }
  }

  const fresh = messages.length === 1;
  const panelId = `${uid}-panel`;

  return (
    <>
      <style>{KEYFRAMES}</style>
      {/* Panel: stays mounted so it can animate; `inert` + invisible while closed keeps it out of the tab order / a11y tree. */}
      <div
        id={panelId}
        role="dialog"
        aria-label="YYC Assistant"
        aria-modal="false"
        inert={!open}
        onKeyDown={onPanelKey}
        className={`fixed z-50 flex flex-col overflow-hidden border border-zinc-200 bg-white text-zinc-900 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100
          inset-2 rounded-2xl sm:inset-auto sm:bottom-24 sm:right-5 sm:h-[min(640px,calc(100dvh-8rem))] sm:w-[400px]
          origin-bottom-right transition-[opacity,transform,visibility] duration-200 ease-out motion-reduce:transition-none
          ${open ? "visible translate-y-0 scale-100 opacity-100" : "invisible translate-y-3 scale-90 opacity-0 delay-[0s,0s,200ms] motion-reduce:delay-0"}`}
      >
        <header className="flex items-center gap-3 bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-3 text-white">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20"><Icon d={SPARK} className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold leading-tight">YYC Assistant</h2>
            <p className="text-xs text-indigo-100">Add contacts &amp; opportunities by chatting</p>
          </div>
          <button onClick={reset} aria-label="Reset conversation" title="Reset conversation" className="rounded-lg p-1.5 hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white">
            <Icon d="M4 12a8 8 0 1 0 3-6.2M4 4v4h4" className="h-5 w-5" />
          </button>
          <button onClick={closePanel} aria-label="Close assistant" className="rounded-lg p-1.5 hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white">
            <Icon d={CLOSE_ICON} className="h-5 w-5" />
          </button>
        </header>

        <div role="log" aria-live="polite" aria-relevant="additions" aria-label="Conversation" className="flex-1 space-y-3 overflow-y-auto bg-zinc-50 px-3 py-4 dark:bg-zinc-950/40">
          {messages.map((m) => (
            <div key={m.id} className={`yyc-pop flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
              <div
                className={`max-w-[88%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "rounded-br-md bg-indigo-600 text-white"
                    : m.error
                      ? "rounded-bl-md border border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200"
                      : "rounded-bl-md border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                }`}
              >
                {m.content}
              </div>
              {m.link && (
                <Link href={m.link.href} onClick={() => { if (window.matchMedia("(max-width: 639px)").matches) closePanel(); }} className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">
                  {m.link.label} <span aria-hidden="true">&rarr;</span>
                </Link>
              )}
              {m.canReuse && m.duplicate && (
                <button className="btn-secondary mt-1.5 !px-3 !py-1 !text-xs" disabled={busy} onClick={() => void send(`Use the existing contact ${m.duplicate!.email} for the opportunity.`)}>
                  Use existing contact for the opportunity
                </button>
              )}
              {m.candidates && m.candidates.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {m.candidates.map((c) => (
                    <button key={c.id} className="btn-secondary !px-2.5 !py-1 !text-xs" disabled={busy} onClick={() => void send(`Use the contact ${c.email || c.name}${c.company ? ` from ${c.company}` : ""}`)}>
                      {c.name}{c.company ? ` (${c.company})` : ""}
                    </button>
                  ))}
                </div>
              )}
              {m.proposal && m.pstate && (
                <div className="w-full max-w-[96%]">
                  <ProposalCard uid={`${uid}-${m.id}`} view={m.proposal} state={m.pstate} error={m.perror} onConfirm={(p) => void confirm(m, p)} onCancel={() => cancel(m)} />
                </div>
              )}
            </div>
          ))}
          {fresh && !busy && (
            <div className="yyc-pop flex flex-wrap gap-1.5 pt-1" aria-label="Suggestions">
              {CHIPS.map((c) => (
                <button
                  key={c.label}
                  className="rounded-full border border-indigo-200 bg-white px-3 py-1.5 text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-50 dark:border-indigo-900 dark:bg-zinc-900 dark:text-indigo-300 dark:hover:bg-indigo-950/50"
                  onClick={() => (c.send ? void send(c.send) : (setInput(c.fill ?? ""), taRef.current?.focus()))}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
          {busy && (
            <div className="flex items-start" role="status" aria-label="Assistant is typing">
              <div className="flex gap-1 rounded-2xl rounded-bl-md border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
                {[0, 150, 300].map((d) => (
                  <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 motion-reduce:animate-pulse" style={{ animationDelay: `${d}ms` }} />
                ))}
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); void send(input); }}
          className="flex items-end gap-2 border-t border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <label htmlFor={`${uid}-input`} className="sr-only">Message</label>
          <textarea
            id={`${uid}-input`}
            ref={taRef}
            rows={1}
            maxLength={1000}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            placeholder="Describe a contact or opportunity..."
            className="input max-h-32 min-h-[2.5rem] resize-none"
            style={{ fieldSizing: "content" } as React.CSSProperties}
          />
          <button type="submit" className="btn-primary h-10 w-10 shrink-0 !p-0" disabled={busy || !input.trim()} aria-label="Send message">
            <Icon d="M5 12h14M13 6l6 6-6 6" className="h-5 w-5" />
          </button>
        </form>
        <p className="bg-white px-3 pb-2 text-center text-[11px] text-zinc-400 dark:bg-zinc-900">Enter to send, Shift+Enter for a new line</p>
      </div>

      {/* Launcher: icon morphs between chat and close (rotate + fade). Hidden on mobile while the panel is full-screen. */}
      <button
        ref={launcherRef}
        onClick={() => (open ? closePanel() : openPanel())}
        aria-label={open ? "Close YYC Assistant" : unread ? "Open YYC Assistant (1 new message)" : "Open YYC Assistant"}
        aria-expanded={open}
        aria-controls={panelId}
        className={`fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg transition-[transform,background-color,opacity] duration-200 ease-out hover:bg-indigo-700 hover:shadow-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 motion-reduce:transition-none ${
          open ? "max-sm:pointer-events-none max-sm:scale-0 max-sm:opacity-0" : "hover:scale-105"
        }`}
      >
        <span className={`absolute transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none ${open ? "rotate-90 scale-50 opacity-0" : "rotate-0 scale-100 opacity-100"}`}><Icon d={CHAT_ICON} /></span>
        <span className={`absolute transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none ${open ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-50 opacity-0"}`}><Icon d={CLOSE_ICON} /></span>
        {unread && !open && <span className="absolute right-0.5 top-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-red-500 dark:border-zinc-900" aria-hidden="true" />}
      </button>
    </>
  );
}
