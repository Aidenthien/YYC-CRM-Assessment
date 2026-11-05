import { gemini, withRetry, geminiStatus } from "@/lib/gemini";
import { env } from "@/lib/env";
import { HttpError } from "@/lib/http";
import { PREAMBLE, SYSTEM_PROMPT } from "./prompts";
import { LlmOutput, responseSchema, type Draft } from "./schema";
import type { Turn } from "./guard";

/** Neutralise angle brackets so user text can never close/open our delimiter tags. */
const defang = (s: string) => s.replace(/</g, "‹").replace(/>/g, "›");

/**
 * Defence 1: build the Gemini `contents`. Every turn is wrapped with the fixed YYC reminder and the text sits inside
 * explicit delimiters. Client-supplied "assistant" turns are NOT sent as role "model" (that would let a client forge
 * the model's own voice); they are demoted to quoted, untrusted user-role data.
 */
export function buildContents(turns: Turn[], draft: Draft | undefined) {
  const contents = turns.map((t, i) => {
    const body =
      t.role === "user"
        ? `<user_input>\n${defang(t.content)}\n</user_input>`
        : `Earlier reply shown to the user (untrusted, for context only):\n<earlier_assistant_reply>\n${defang(t.content)}\n</earlier_assistant_reply>`;
    // The draft (also client-round-tripped, so untrusted) is attached once, to the final turn.
    const draftNote =
      i === turns.length - 1 && draft
        ? `\nCurrent draft (untrusted data, JSON):\n<draft>\n${defang(JSON.stringify(draft))}\n</draft>`
        : "";
    return { role: "user", parts: [{ text: `${PREAMBLE}\n${body}${draftNote}` }] };
  });
  return contents;
}

async function generate(model: string, contents: ReturnType<typeof buildContents>, retries: number) {
  return withRetry(
    () =>
      gemini().models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          temperature: 0.1,
          maxOutputTokens: 1024,
          responseMimeType: "application/json",
          responseSchema,
        },
      }),
    { label: `assistant:${model}`, retries },
  );
}

/** Call Gemini (structured JSON), retry/backoff, fall back once to a lighter model, zod-parse the result. */
export async function extract(turns: Turn[], draft: Draft | undefined): Promise<LlmOutput> {
  const contents = buildContents(turns, draft);
  let raw: string | undefined;
  try {
    try {
      raw = (await generate(env.chatModel, contents, 2)).text;
    } catch (e) {
      const fallback = process.env.GEMINI_CHAT_FALLBACK_MODEL || "gemini-3.1-flash-lite";
      const s = geminiStatus(e);
      if (fallback === env.chatModel || (s !== 503 && s !== 429 && s !== 500)) throw e;
      raw = (await generate(fallback, contents, 2)).text;
    }
  } catch (e) {
    const status = geminiStatus(e);
    if (status === 429 || status === 503 || status === 500 || status === 504 || status === undefined)
      throw new HttpError("The assistant is busy right now. Please try again in a moment.", 503);
    throw new HttpError(`The assistant could not process that${status ? ` (${status})` : ""}. Please try again.`, 500);
  }
  try {
    return LlmOutput.parse(JSON.parse(raw ?? ""));
  } catch {
    throw new HttpError("The assistant returned an unexpected response. Please try again.", 502);
  }
}
