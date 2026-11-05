import { GoogleGenAI, ApiError } from "@google/genai";
import { env } from "./env";

let client: GoogleGenAI | null = null;

/** Lazily created Gemini client (server-side only; the key never reaches the browser). */
export function gemini(): GoogleGenAI {
  if (!client) client = new GoogleGenAI({ apiKey: env.geminiApiKey });
  return client;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function geminiStatus(e: unknown): number | undefined {
  if (e instanceof ApiError) return e.status;
  const s = (e as { status?: number })?.status;
  return typeof s === "number" ? s : undefined;
}

/** Retry transient Gemini failures (429 rate limit, 500/503 overloaded, network) with exponential backoff + jitter. */
export async function withRetry<T>(fn: () => Promise<T>, opts: { retries?: number; baseMs?: number; label?: string } = {}): Promise<T> {
  const { retries = 5, baseMs = 2000, label = "gemini" } = opts;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const status = geminiStatus(e);
      const transient = status === 429 || status === 500 || status === 503 || status === 504 || status === undefined;
      if (!transient || attempt >= retries) throw e;
      // 429 on the free tier usually needs a longer wait (per-minute quota)
      const wait = baseMs * 2 ** attempt * (status === 429 ? 2 : 1) + Math.random() * 500;
      console.warn(`[${label}] ${status ?? "network error"}; retry ${attempt + 1}/${retries} in ${Math.round(wait)}ms`);
      await sleep(Math.min(wait, 60000));
    }
  }
}
