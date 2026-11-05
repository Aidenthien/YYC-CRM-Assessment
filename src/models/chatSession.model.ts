import { db } from "@/lib/supabase";
import type { ChatSession, ChatSessionSummary } from "@/types";

interface SessionRow {
  id: string;
  title: string;
  contact_id: string | null;
  created_at: string;
  updated_at: string;
  contacts?: { name: string } | { name: string }[] | null;
}

const contactName = (r: SessionRow) => (Array.isArray(r.contacts) ? r.contacts[0]?.name : r.contacts?.name) ?? null;

/** Strips characters that are special in PostgREST `or()` filters / ilike patterns. */
const safe = (s: string) => s.replace(/[,()%_\\*"']/g, " ").replace(/\s+/g, " ").trim();

function snippet(text: string, term: string): string {
  const flat = text.replace(/\s+/g, " ");
  const i = flat.toLowerCase().indexOf(term.toLowerCase());
  if (i < 0) return flat.slice(0, 120);
  const start = Math.max(0, i - 40);
  return (start > 0 ? "..." : "") + flat.slice(start, i + term.length + 80) + (i + term.length + 80 < flat.length ? "..." : "");
}

export const ChatSessionModel = {
  async create(r: { title: string; contact_id: string | null }): Promise<string> {
    const { data, error } = await db().from("chat_sessions").insert(r).select("id").single();
    if (error) throw error;
    return data.id as string;
  },

  async get(id: string): Promise<ChatSession | null> {
    const { data, error } = await db()
      .from("chat_sessions")
      .select("id,title,contact_id,created_at,updated_at,contacts(name)")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const row = data as unknown as SessionRow;
    return { id: row.id, title: row.title, contact_id: row.contact_id, contact_name: contactName(row), created_at: row.created_at, updated_at: row.updated_at };
  },

  async touch(id: string): Promise<void> {
    const { error } = await db().from("chat_sessions").update({ updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
  },

  async rename(id: string, title: string): Promise<void> {
    const { error } = await db().from("chat_sessions").update({ title }).eq("id", id);
    if (error) throw error;
  },

  async remove(id: string): Promise<void> {
    const { error } = await db().from("chat_sessions").delete().eq("id", id);
    if (error) throw error;
  },

  async list(opts: { q?: string; contact_id?: string; limit: number }): Promise<ChatSessionSummary[]> {
    const term = opts.q ? safe(opts.q) : "";
    let q = db()
      .from("chat_sessions")
      .select("id,title,contact_id,created_at,updated_at,contacts(name)")
      .order("updated_at", { ascending: false })
      .limit(opts.limit);
    if (opts.contact_id) q = q.eq("contact_id", opts.contact_id);
    if (term) {
      const { data: hits, error: he } = await db()
        .from("rag_queries")
        .select("session_id")
        .or(`question.ilike.%${term}%,answer.ilike.%${term}%`)
        .not("session_id", "is", null)
        .limit(1000);
      if (he) throw he;
      const ids = [...new Set((hits ?? []).map((h) => h.session_id as string))];
      q = q.or(`title.ilike.%${term}%${ids.length ? `,id.in.(${ids.join(",")})` : ""}`);
    }
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []) as unknown as SessionRow[];
    if (!rows.length) return [];

    const { data: msgs, error: me } = await db()
      .from("rag_queries")
      .select("session_id,question,answer,created_at")
      .in("session_id", rows.map((r) => r.id))
      .order("created_at", { ascending: true });
    if (me) throw me;
    const by = new Map<string, { question: string; answer: string }[]>();
    for (const m of msgs ?? []) {
      const arr = by.get(m.session_id as string) ?? [];
      arr.push({ question: m.question as string, answer: m.answer as string });
      by.set(m.session_id as string, arr);
    }

    return rows.map((r) => {
      const ms = by.get(r.id) ?? [];
      const lower = term.toLowerCase();
      let match: string | null = null;
      if (term && !r.title.toLowerCase().includes(lower)) {
        const hit = ms.find((m) => m.question.toLowerCase().includes(lower)) ?? ms.find((m) => m.answer.toLowerCase().includes(lower));
        if (hit) match = snippet(hit.question.toLowerCase().includes(lower) ? hit.question : hit.answer, term);
      }
      return {
        id: r.id,
        title: r.title,
        contact_id: r.contact_id,
        contact_name: contactName(r),
        created_at: r.created_at,
        updated_at: r.updated_at,
        message_count: ms.length,
        last_question: ms.length ? ms[ms.length - 1].question.slice(0, 120) : null,
        match_snippet: match,
      };
    });
  },
};
