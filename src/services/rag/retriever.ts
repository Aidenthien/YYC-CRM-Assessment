import { env } from "@/lib/env";
import { embedQuery } from "./embedder";
import { TaxDocumentModel } from "@/models/taxDocument.model";
import type { RetrievedChunk } from "./types";

const STOP = new Set(["what", "which", "when", "where", "does", "that", "this", "with", "from", "have", "should", "would", "could", "about", "their", "there", "into", "than", "then", "they", "been", "your", "must", "shall", "under", "required", "need", "needs"]);

/** Distinct content words (>=4 chars, not stop words) of the question. */
function keywords(q: string): string[] {
  return [...new Set(q.toLowerCase().match(/[a-z0-9]{4,}/g) ?? [])].filter((w) => !STOP.has(w));
}

/** Cheap lexical check: does the chunk contain at least 2 distinct question keywords (or 1 if the question has <=2)? */
function hasKeywordHit(content: string, kws: string[]): boolean {
  if (!kws.length) return false;
  const text = content.toLowerCase();
  const hits = kws.filter((k) => text.includes(k.length > 5 ? k.slice(0, -1) : k)).length; // crude stemming
  return hits >= Math.min(2, kws.length);
}

export interface RetrieveOptions { topK?: number; category?: string; candidatePool?: number }

/**
 * Hybrid retrieval:
 *  1. embed the question (RETRIEVAL_QUERY, same 768 dims, L2-normalised),
 *  2. call match_tax_chunks (vector cosine + Postgres FTS fused with RRF) for a candidate pool (default 2x topK, min 12),
 *  3. LLM-free filter: drop a candidate only if its cosine similarity < RAG_MIN_SIMILARITY AND it has no lexical keyword hit,
 *  4. keep the first topK in RRF order.
 * Out-of-scope questions therefore usually end with zero chunks (or only weak ones the LLM guard refuses).
 */
export async function retrieve(question: string, opts: RetrieveOptions = {}): Promise<RetrievedChunk[]> {
  const topK = opts.topK ?? env.topK;
  const pool = opts.candidatePool ?? Math.max(12, topK * 2);
  const embedding = await embedQuery(question);
  const rows = await TaxDocumentModel.matchChunks(question, embedding, pool, opts.category);
  const kws = keywords(question);
  const withHits: RetrievedChunk[] = rows.map((r) => ({ ...r, keyword_hit: hasKeywordHit(r.content, kws) }));
  return withHits.filter((c) => c.similarity >= env.minSimilarity || c.keyword_hit).slice(0, topK);
}
