import { db } from "@/lib/supabase";
import type { Citation } from "@/types";

export interface RagQueryRow {
  id: string;
  contact_id: string | null;
  question: string;
  answer: string;
  citations: Citation[];
  answerable: boolean;
  session_id?: string | null;
  created_at: string;
}

export const RagQueryModel = {
  async bySession(sessionId: string, opts: { last?: number } = {}): Promise<RagQueryRow[]> {
    if (opts.last) {
      const { data, error } = await db().from("rag_queries").select("*").eq("session_id", sessionId).order("created_at", { ascending: false }).limit(opts.last);
      if (error) throw error;
      return ((data ?? []) as RagQueryRow[]).reverse();
    }
    const { data, error } = await db().from("rag_queries").select("*").eq("session_id", sessionId).order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []) as RagQueryRow[];
  },

  async insert(r: { contact_id: string | null; question: string; answer: string; citations: Citation[]; answerable: boolean; session_id?: string }): Promise<string> {
    const { data, error } = await db().from("rag_queries").insert(r).select("id").single();
    if (error) throw error;
    return data.id as string;
  },

  async list(opts: { contact_id?: string; limit: number }): Promise<RagQueryRow[]> {
    let q = db().from("rag_queries").select("*").order("created_at", { ascending: false }).limit(opts.limit);
    if (opts.contact_id) q = q.eq("contact_id", opts.contact_id);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as RagQueryRow[];
  },
};
