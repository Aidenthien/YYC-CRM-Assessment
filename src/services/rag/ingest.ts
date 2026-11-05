import fs from "node:fs/promises";
import path from "node:path";
import { downloadPdf, parsePdf } from "./parser";
import { chunkPages } from "./chunker";
import { embedDocuments } from "./embedder";
import { TaxDocumentModel } from "@/models/taxDocument.model";
import type { Chunk, SourceDoc } from "./types";

export async function loadSources(): Promise<SourceDoc[]> {
  return JSON.parse(await fs.readFile(path.join(process.cwd(), "data", "sources.json"), "utf8"));
}

/** The text actually embedded: chunk content prefixed with document + section for better retrieval context. */
export function embeddingText(doc: SourceDoc, c: Chunk): string {
  return `${doc.name}${c.section ? ` | ${c.section}` : ""}\n${c.content}`;
}

export interface IngestStats { name: string; pages: number; chars: number; chunks: number; avgChunk: number; maxChunk: number; sample?: Chunk }

export async function ingestDocument(doc: SourceDoc, opts: { dryRun?: boolean } = {}): Promise<IngestStats> {
  const file = await downloadPdf(doc);
  const pages = await parsePdf(file);
  const chunks = chunkPages(pages);
  const chars = pages.reduce((n, p) => n + p.text.length, 0);
  if (chars / pages.length < 200) throw new Error(`${doc.name}: little extractable text (scanned PDF?)`);
  const stats: IngestStats = {
    name: doc.name, pages: pages.length, chars, chunks: chunks.length,
    avgChunk: Math.round(chunks.reduce((n, c) => n + c.content.length, 0) / Math.max(1, chunks.length)),
    maxChunk: Math.max(...chunks.map((c) => c.content.length)),
    sample: chunks[Math.min(3, chunks.length - 1)],
  };
  if (opts.dryRun) return stats;

  // Real embeddings (RETRIEVAL_DOCUMENT) first, so a failure never leaves a doc half-replaced.
  const vectors = await embedDocuments(chunks.map((c) => embeddingText(doc, c)), 20, 600, (n) =>
    process.stdout.write(`\r  embedded ${n}/${chunks.length}`));
  process.stdout.write("\n");
  const id = await TaxDocumentModel.upsert({ name: doc.name, category: doc.category, source_url: doc.url, page_count: pages.length });
  await TaxDocumentModel.replaceChunks(id, chunks, vectors);
  return stats;
}
