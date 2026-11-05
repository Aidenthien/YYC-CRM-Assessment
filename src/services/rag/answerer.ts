import { Type } from "@google/genai";
import { z } from "zod";
import { gemini, withRetry, geminiStatus } from "@/lib/gemini";
import { env } from "@/lib/env";
import { HttpError } from "@/lib/http";
import { SYSTEM_PROMPT, NOT_FOUND_ANSWER, buildUserPrompt } from "./prompts";
import type { Citation } from "@/types";
import type { RetrievedChunk } from "./types";

const LlmOutput = z.object({
  answerable: z.boolean(),
  answer: z.string().min(1),
  used_sources: z.array(z.number().int()).default([]),
});

// Structured output schema enforced by Gemini (responseMimeType + responseSchema)
const responseSchema = {
  type: Type.OBJECT,
  properties: {
    answerable: { type: Type.BOOLEAN },
    answer: { type: Type.STRING },
    used_sources: { type: Type.ARRAY, items: { type: Type.INTEGER } },
  },
  required: ["answerable", "answer", "used_sources"],
  propertyOrdering: ["answerable", "answer", "used_sources"],
};

export interface AnswerResult { answerable: boolean; answer: string; citations: Citation[] }

const refusal = (): AnswerResult => ({ answerable: false, answer: NOT_FOUND_ANSWER, citations: [] });

function toCitation(n: number, c: RetrievedChunk): Citation {
  return {
    n,
    document_id: c.document_id,
    document_name: c.document_name,
    source_url: c.source_url,
    page_start: c.page_start,
    page_end: c.page_end,
    section: c.section,
    excerpt: c.content.replace(/\s+/g, " ").slice(0, 300),
  };
}

/** Generate a grounded answer from retrieved chunks. Skips the LLM entirely when there is no context. */
export async function answer(question: string, chunks: RetrievedChunk[], clientContext?: string | null): Promise<AnswerResult> {
  if (!chunks.length) return refusal(); // code-level guard: nothing retrieved => never ask the model

  let text: string | undefined;
  try {
    const generate = (model: string, retries: number) =>
      withRetry(
        () =>
          gemini().models.generateContent({
            model,
            contents: buildUserPrompt(question, chunks, clientContext),
            config: {
              systemInstruction: SYSTEM_PROMPT,
              temperature: 0.1,
              maxOutputTokens: 4096,
              responseMimeType: "application/json",
              responseSchema,
            },
          }),
        { label: `generate:${model}`, retries },
      );
    try {
      text = (await generate(env.chatModel, 3)).text;
    } catch (e) {
      // primary model overloaded (503) or rate limited: fall back once to a lighter model
      const fallback = process.env.GEMINI_CHAT_FALLBACK_MODEL || "gemini-3.1-flash-lite";
      const s = geminiStatus(e);
      if (fallback === env.chatModel || (s !== 503 && s !== 429 && s !== 500)) throw e;
      text = (await generate(fallback, 3)).text;
    }
  } catch (e) {
    const status = geminiStatus(e);
    if (status === 429 || status === 503 || status === 500 || status === 504 || status === undefined)
      throw new HttpError("The AI service is temporarily unavailable. Please try again shortly.", 503);
    throw new HttpError(`AI request failed${status ? ` (${status})` : ""}.`, 500);
  }

  let parsed: z.infer<typeof LlmOutput>;
  try {
    parsed = LlmOutput.parse(JSON.parse(text ?? ""));
  } catch {
    throw new HttpError("The AI returned an invalid response. Please try again.", 500);
  }

  if (!parsed.answerable) return refusal();

  // Citations only from sources the model says it used (validated against the numbered context),
  // falling back to [n] markers found in the answer text.
  const fromText = [...parsed.answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
  const used = [...new Set([...parsed.used_sources, ...fromText])].filter((n) => n >= 1 && n <= chunks.length).sort((a, b) => a - b);
  if (!used.length) return refusal(); // "answerable" but cites nothing => not grounded; refuse rather than risk a hallucination
  // Drop markers that do not map to a numbered context chunk (e.g. the model echoing a paragraph number like [26]).
  const answer = parsed.answer.replace(/\s*\[(\d+)\]/g, (m, n) => (Number(n) >= 1 && Number(n) <= chunks.length ? m : "")).trim();
  return { answerable: true, answer, citations: used.map((n) => toCitation(n, chunks[n - 1])) };
}
