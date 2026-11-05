import { db } from "@/lib/supabase";
import type { TaxDocument } from "@/types";
import type { Chunk, RetrievedChunk } from "@/services/rag/types";

export const TaxDocumentModel = {
  async list(): Promise<TaxDocument[]> {
    const { data, error } = await db()
      .from("tax_documents")
      .select("id,name,category,source_url,page_count,chunk_count")
      .order("category")
      .order("name");
    if (error) throw error;
    return (data ?? []) as TaxDocument[];
  },

  /** Insert or update by source_url (unique). */
  async upsert(d: { name: string; category: string; source_url: string; page_count: number }): Promise<string> {
    const { data, error } = await db()
      .from("tax_documents")
      .upsert({ ...d, ingested_at: new Date().toISOString() }, { onConflict: "source_url" })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  },

  /** Idempotent re-ingest: delete the doc's chunks then insert the new set. */
  async replaceChunks(documentId: string, chunks: Chunk[], embeddings: number[][]): Promise<void> {
    const { error: delErr } = await db().from("tax_chunks").delete().eq("document_id", documentId);
    if (delErr) throw delErr;
    const rows = chunks.map((c, i) => ({
      document_id: documentId,
      chunk_index: c.chunk_index,
      page_start: c.page_start,
      page_end: c.page_end,
      section: c.section,
      content: c.content,
      embedding: `[${embeddings[i].join(",")}]`, // pgvector text input
    }));
    for (let i = 0; i < rows.length; i += 50) {
      const { error } = await db().from("tax_chunks").insert(rows.slice(i, i + 50));
      if (error) throw error;
    }
    const { error } = await db().from("tax_documents").update({ chunk_count: rows.length }).eq("id", documentId);
    if (error) throw error;
  },

  /** Hybrid (vector + keyword, RRF) search via the match_tax_chunks RPC. */
  async matchChunks(queryText: string, embedding: number[], matchCount: number, category?: string): Promise<Omit<RetrievedChunk, "keyword_hit">[]> {
    const { data, error } = await db().rpc("match_tax_chunks", {
      query_text: queryText,
      query_embedding: `[${embedding.join(",")}]`,
      match_count: matchCount,
      filter_category: category ?? null,
      rrf_k: 60,
    });
    if (error) throw error;
    return (data ?? []) as Omit<RetrievedChunk, "keyword_hit">[];
  },
};
