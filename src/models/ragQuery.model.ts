import { db } from "@/lib/supabase";
import type { Citation } from "@/types";

export interface RagQueryRow {
  id: string;
  contact_id: string | null;
  question: string;
  answer: string;
  citations: Citation[];
  answerable: boolean;
  created_at: string;
}

export const RagQueryModel = {
  async insert(r: { contact_id: string | null; question: string; answer: string; citations: Citation[]; answerable: boolean }): Promise<string> {
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
