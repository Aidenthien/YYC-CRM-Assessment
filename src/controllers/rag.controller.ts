import { z } from "zod";
import { db } from "@/lib/supabase";
import { HttpError } from "@/lib/http";
import { retrieve } from "@/services/rag/retriever";
import { answer } from "@/services/rag/answerer";
import { TaxDocumentModel } from "@/models/taxDocument.model";
import { RagQueryModel } from "@/models/ragQuery.model";
import type { RagAnswer, RagAskRequest, TaxDocument } from "@/types";

const AskSchema = z.object({
  question: z.string().trim().min(3, "question is too short").max(1000),
  contact_id: z.uuid().optional(),
  category: z.string().trim().min(1).max(50).optional(),
}) satisfies z.ZodType<RagAskRequest>;

const HistorySchema = z.object({
  contact_id: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** Loads the contact + open deals directly (RAG module is self-contained) and renders a short prompt block. */
async function clientContext(contactId: string): Promise<string> {
  const { data: c, error } = await db().from("contacts").select("id,name,company,status").eq("id", contactId).maybeSingle();
  if (error) throw error;
  if (!c) throw new HttpError("Contact not found", 404);
  const { data: opps, error: e2 } = await db()
    .from("opportunities")
    .select("title,value_rm,stage")
    .eq("contact_id", contactId)
    .not("stage", "in", "(Won,Lost)")
    .order("value_rm", { ascending: false })
    .limit(5);
  if (e2) throw e2;
  const deals = (opps ?? []).map((o) => `${o.title} (RM ${Number(o.value_rm).toLocaleString("en-MY")}, ${o.stage})`);
  return [
    `Name: ${c.name}`,
    `Company: ${c.company ?? "n/a"}`,
    `Status: ${c.status}`,
    `Open deals: ${deals.length ? deals.join("; ") : "none"}`,
  ].join("\n");
}

export async function ask(body: unknown): Promise<RagAnswer> {
  const input = AskSchema.parse(body);
  const context = input.contact_id ? await clientContext(input.contact_id) : null;

  const chunks = await retrieve(input.question, { category: input.category });
  const result = await answer(input.question, chunks, context);

  const query_id = await RagQueryModel.insert({
    contact_id: input.contact_id ?? null,
    question: input.question,
    answer: result.answer,
    citations: result.citations,
    answerable: result.answerable,
  });

  return {
    ...result,
    retrieved: chunks.map((c) => ({
      chunk_id: c.id,
      document_name: c.document_name,
      page_start: c.page_start,
      similarity: Number(c.similarity.toFixed(4)),
      rrf_score: Number(c.rrf_score.toFixed(5)),
    })),
    query_id,
  };
}

export async function history(params: unknown) {
  const { contact_id, limit } = HistorySchema.parse(params);
  return RagQueryModel.list({ contact_id, limit });
}

export async function documents(): Promise<TaxDocument[]> {
  return TaxDocumentModel.list();
}
