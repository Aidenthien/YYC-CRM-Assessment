// Deterministic, LLM-free defences for the YYC assistant:
//  - defence 2 (pre-LLM guard: length/turn caps, sanitising, jailbreak denylist)
//  - defence 4 helpers (money parsing, prompt-leak detection)
//  - defence 5 (in-memory token-bucket rate limit)

export const MAX_MESSAGE_CHARS = 1000;
export const MAX_TURNS = 12;

export const REFUSAL_MESSAGE =
  "I can only help create CRM contacts and opportunities, and I can't act on that request. Tell me about a contact (name plus an email, phone or company) or an opportunity (title, value in RM and the contact) and I'll set it up for you.";

/**
 * Normalise untrusted text: Unicode NFKC (folds full-width / compatibility homoglyphs), strip control chars,
 * zero-width / bidi / invisible formatting chars, collapse whitespace runs, clamp length.
 */
export function sanitizeText(input: unknown, max = MAX_MESSAGE_CHARS): string {
  if (typeof input !== "string") return "";
  return input
    .normalize("NFKC")
    // C0/C1 control chars except \n (0x0A) and \t (0x09)
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g, "")
    // zero-width, bidi overrides, word joiner, invisible operators, BOM, soft hyphen, tag characters
    .replace(/[​-‏‪-‮⁠-⁯﻿­\u{E0000}-\u{E007F}]/gu, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

// Cyrillic/Greek look-alikes folded to latin so a Cyrillic "o" inside "ignore" still matches.
const HOMOGLYPHS: Record<string, string> = {
  "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "х": "x", "у": "y",
  "і": "i", "ј": "j", "ѕ": "s", "ԁ": "d", "ɡ": "g",
  "α": "a", "ε": "e", "ο": "o", "ρ": "p", "ι": "i", "ν": "v", "τ": "t", "υ": "u",
};
const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s" };

/** Aggressive canonical form used ONLY for pattern matching (never stored or sent on). */
export function canonicalForMatching(text: string): string {
  const folded = [...text.toLowerCase()].map((c) => HOMOGLYPHS[c] ?? c).join("");
  const unleet = folded.replace(/(?<=[a-z])[01345@$7]|[01345@$7](?=[a-z])/g, (c) => LEET[c] ?? c);
  return unleet.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

// Jailbreak / prompt-injection denylist (matched against the canonical form).
const INJECTION_PATTERNS: RegExp[] = [
  /\b(ignore|disregard|forget|override|bypass|skip)\b.{0,30}\b(previous|prior|above|earlier|all|any|your|the|these|those)\b.{0,30}\b(instructions?|rules?|prompts?|guidelines?|directions?|constraints?|restrictions?)\b/,
  /\bignore (everything|all) (above|before|prior)\b/,
  /\byou are now\b/,
  /\bfrom now on (you|act|behave|respond|pretend)\b/,
  /\b(system|developer|initial|hidden|secret|original) (prompt|message|instructions?)\b/,
  /\b(reveal|print|show|display|repeat|leak|output|tell me|dump|recite) (me )?(your|the) (prompt|instructions?|rules|system|configuration|config|secrets?|api key|keys?)\b/,
  /\bdeveloper mode\b|\bdebug mode\b|\bgod mode\b|\bjailbreak(ed|ing)?\b|\bunrestricted mode\b/,
  /\bdan\b.{0,20}\b(mode|prompt)\b|\bdo anything now\b/,
  /\b(act|behave|respond|reply|answer|pretend|roleplay|role play) (as|like) (a|an|if|though|the|my)\b/,
  /\bpretend (to be|you are|that you)\b/,
  /\brole ?play\b/,
  /\bsimulate (a|an|being)\b/,
  /\bnew (instructions?|rules?|persona|role)\b/,
  /\b(without|no) (any )?(restrictions?|limits?|filters?|rules)\b/,
  /\b(base64|hex|hexadecimal|rot13)\b.{0,40}\b(decode|instruction|command|execute|follow)\b|\b(decode|execute|follow)\b.{0,40}\b(base64|hex|hexadecimal|rot13)\b/,
  /\b(drop|truncate) table\b|\bdelete from\b|\bunion select\b|\bselect \* from\b/,
  /\b(delete|remove|erase|wipe|export|dump|download) (all|every|the whole|my entire) (contacts?|opportunit(y|ies)|data|records?|database)\b/,
];
// Checked on the raw sanitised text (canonicalisation would strip the symbols these rely on).
const RAW_PATTERNS: RegExp[] = [
  /<\s*\/?\s*(system|user_input|assistant|instructions?)\s*>/i,
  /^\s*(system|assistant)\s*:/im,
  /\[\s*\/?\s*(system|inst)\s*\]/i,
];
const LONG_ENCODED = /[A-Za-z0-9+/=]{80,}|(?:[0-9a-fA-F]{2}\s?){40,}/;

export function detectInjection(text: string): boolean {
  if (RAW_PATTERNS.some((r) => r.test(text))) return true;
  if (LONG_ENCODED.test(text)) return true;
  const canon = canonicalForMatching(text);
  return INJECTION_PATTERNS.some((r) => r.test(canon));
}

export type Turn = { role: "user" | "assistant"; content: string };
export type GuardResult =
  | { ok: true; turns: Turn[] }
  | { ok: false; reason: "invalid" | "injection"; message: string };

/**
 * Validate + sanitise the client-supplied dialog: at most MAX_TURNS turns, each at most MAX_MESSAGE_CHARS.
 * Every turn (including client-supplied "assistant" turns, which are untrusted) is scanned for jailbreak
 * patterns, so a forged assistant turn cannot smuggle instructions either.
 */
export function guardMessages(raw: unknown): GuardResult {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, reason: "invalid", message: "Please type a message." };
  const turns: Turn[] = [];
  for (const m of raw.slice(-MAX_TURNS)) {
    const role = (m as { role?: unknown })?.role;
    const rawContent = (m as { content?: unknown })?.content;
    if ((role !== "user" && role !== "assistant") || typeof rawContent !== "string") return { ok: false, reason: "invalid", message: "Invalid message format." };
    if (rawContent.length > MAX_MESSAGE_CHARS) {
      if (role === "user") return { ok: false, reason: "invalid", message: `Messages are limited to ${MAX_MESSAGE_CHARS} characters. Please shorten it.` };
    }
    const content = sanitizeText(rawContent);
    if (content) turns.push({ role, content });
  }
  if (!turns.length || turns[turns.length - 1].role !== "user") return { ok: false, reason: "invalid", message: "Please type a message." };
  for (const t of turns) {
    if (detectInjection(t.content)) {
      console.warn(`[assistant] guard: injection pattern matched in ${t.role} turn (len=${t.content.length})`); // no PII logged
      return { ok: false, reason: "injection", message: REFUSAL_MESSAGE };
    }
  }
  return { ok: true, turns };
}

/** Parse "RM 50k", "50,000", "RM1.5m", "50000.50" into a number >= 0; null if not parseable. */
export function parseMoney(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 && v <= 1e12 ? Math.round(v * 100) / 100 : null;
  if (typeof v !== "string") return null;
  const m = v.toLowerCase().replace(/rm|myr|ringgit/g, "").replace(/[,\s_]/g, "").match(/^(\d+(?:\.\d+)?)(k|m|mil|million|thousand)?$/);
  if (!m) return null;
  const mult = !m[2] ? 1 : m[2].startsWith("k") || m[2] === "thousand" ? 1e3 : 1e6;
  const n = Number(m[1]) * mult;
  return Number.isFinite(n) && n <= 1e12 ? Math.round(n * 100) / 100 : null;
}

// ---- Rate limit (defence 5): in-memory token bucket per client key. Per-instance only. ----
interface Bucket { tokens: number; ts: number }
const buckets = new Map<string, Bucket>();
const CAPACITY = 20; // burst size
const REFILL_PER_MS = CAPACITY / 60_000; // 20 requests per minute sustained

export function rateLimit(key: string, now = Date.now()): { allowed: boolean; retryAfterSec: number } {
  const b = buckets.get(key) ?? { tokens: CAPACITY, ts: now };
  b.tokens = Math.min(CAPACITY, b.tokens + (now - b.ts) * REFILL_PER_MS);
  b.ts = now;
  let allowed = false;
  if (b.tokens >= 1) { b.tokens -= 1; allowed = true; }
  buckets.set(key, b);
  if (buckets.size > 5000) for (const [k, v] of buckets) if (now - v.ts > 120_000) buckets.delete(k); // bound memory
  return { allowed, retryAfterSec: allowed ? 0 : Math.max(1, Math.ceil((1 - b.tokens) / REFILL_PER_MS / 1000)) };
}

/** Does the reply leak chunks of the fixed system prompt (8-word sliding window) or look like a credential? */
export function leaksPrompt(reply: string, secretText: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const r = norm(reply);
  const words = norm(secretText).split(" ");
  for (let i = 0; i + 8 <= words.length; i += 2) if (r.includes(words.slice(i, i + 8).join(" "))) return true;
  return /\bAIza[0-9A-Za-z_-]{20,}|\bsk-[A-Za-z0-9]{20,}|service_role|api[_ ]?key\s*[:=]/i.test(reply);
}
