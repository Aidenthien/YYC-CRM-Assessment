import { gemini, withRetry } from "@/lib/gemini";
import { env } from "@/lib/env";

export type EmbedTask = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

/** gemini-embedding-001 only returns unit-length vectors at 3072 dims; truncated (768) ones must be re-normalised. */
export function l2Normalize(v: number[]): number[] {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map((x) => x / n);
}

/** Embed texts with Gemini (one batched API call), returning L2-normalised vectors of env.embeddingDims. */
export async function embedTexts(texts: string[], taskType: EmbedTask): Promise<number[][]> {
  if (!texts.length) return [];
  const res = await withRetry(
    () =>
      gemini().models.embedContent({
        model: env.embeddingModel,
        contents: texts,
        config: { taskType, outputDimensionality: env.embeddingDims },
      }),
    { label: "embed" },
  );
  const out = (res.embeddings ?? []).map((e) => e.values ?? []);
  if (out.length !== texts.length || out.some((v) => v.length !== env.embeddingDims))
    throw new Error(`Embedding response mismatch: expected ${texts.length}x${env.embeddingDims}`);
  return out.map(l2Normalize);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Embed many documents in batches (default 20/request) with a small pause to respect per-minute quotas. */
export async function embedDocuments(texts: string[], batchSize = 20, pauseMs = 500, onProgress?: (done: number) => void) {
  const all: number[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    all.push(...(await embedTexts(texts.slice(i, i + batchSize), "RETRIEVAL_DOCUMENT")));
    onProgress?.(Math.min(i + batchSize, texts.length));
    if (i + batchSize < texts.length) await sleep(pauseMs);
  }
  return all;
}

export async function embedQuery(q: string): Promise<number[]> {
  return (await embedTexts([q], "RETRIEVAL_QUERY"))[0];
}
