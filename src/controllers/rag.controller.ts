import { z } from "zod";
import { db } from "@/lib/supabase";
import { HttpError } from "@/lib/http";
import { retrieve } from "@/services/rag/retriever";
import { answer } from "@/services/rag/answerer";
import { TaxDocumentModel } from "@/models/taxDocument.model";
import { RagQueryModel } from "@/models/ragQuery.model";
import { ChatSessionModel } from "@/models/chatSession.model";
import type { ChatSessionDetail, ChatSessionSummary, RagAnswer, RagAskRequest, TaxDocument } from "@/types";

const AskSchema = z.object({
  session_id: z.uuid().optional(),
  question: z.string().trim().min(3, "question is too short").max(1000),
  contact_id: z.uuid().optional(),
  category: z.string().trim().min(1).max(50).optional(),
}) satisfies z.ZodType<RagAskRequest>;

const SessionsSchema = z.object({
  q: z.string().trim().max(200).optional(),
  contact_id: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const RenameSchema = z.object({ title: z.string().trim().min(1, "title is required").max(120) });
const IdSchema = z.uuid("invalid session id");

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

  let sessionId = input.session_id;
  let contactId = input.contact_id;
  let prior: { question: string; answer: string }[] = [];
  if (sessionId) {
    const session = await ChatSessionModel.get(sessionId);
    if (!session) throw new HttpError("Chat session not found", 404);
    contactId = contactId ?? session.contact_id ?? undefined;
    prior = (await RagQueryModel.bySession(sessionId, { last: 3 })).map((r) => ({ question: r.question, answer: r.answer }));
  }

  const context = contactId ? await clientContext(contactId) : null;

  // Follow-ups like "and what's the penalty?" carry no topic: augment retrieval with the previous question.
  const short = input.question.split(/\s+/).length < 8;
  const retrievalQuery = prior.length && short ? `${prior[prior.length - 1].question} ${input.question}` : input.question;

  const chunks = await retrieve(retrievalQuery, { category: input.category });
  const result = await answer(input.question, chunks, context, prior);

  if (!sessionId) {
    sessionId = await ChatSessionModel.create({ title: input.question.slice(0, 60), contact_id: contactId ?? null });
  }
  const query_id = await RagQueryModel.insert({
    contact_id: contactId ?? null,
    question: input.question,
    answer: result.answer,
    citations: result.citations,
    answerable: result.answerable,
    session_id: sessionId,
  });
  await ChatSessionModel.touch(sessionId);

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
    session_id: sessionId,
  };
}

export async function listSessions(params: unknown): Promise<ChatSessionSummary[]> {
  return ChatSessionModel.list(SessionsSchema.parse(params));
}

export async function getSession(rawId: string): Promise<ChatSessionDetail> {
  const id = IdSchema.parse(rawId);
  const session = await ChatSessionModel.get(id);
  if (!session) throw new HttpError("Chat session not found", 404);
  const rows = await RagQueryModel.bySession(id);
  return {
    ...session,
    messages: rows.map((r) => ({ id: r.id, question: r.question, answer: r.answer, answerable: r.answerable, citations: r.citations ?? [], created_at: r.created_at })),
  };
}

export async function renameSession(rawId: string, body: unknown): Promise<ChatSessionDetail> {
  const id = IdSchema.parse(rawId);
  const { title } = RenameSchema.parse(body);
  if (!(await ChatSessionModel.get(id))) throw new HttpError("Chat session not found", 404);
  await ChatSessionModel.rename(id, title);
  return getSession(id);
}

export async function removeSession(rawId: string) {
  const id = IdSchema.parse(rawId);
  if (!(await ChatSessionModel.get(id))) throw new HttpError("Chat session not found", 404);
  await ChatSessionModel.remove(id);
  return { id };
}

export async function history(params: unknown) {
  const { contact_id, limit } = HistorySchema.parse(params);
  return RagQueryModel.list({ contact_id, limit });
}

export async function documents(): Promise<TaxDocument[]> {
  return TaxDocumentModel.list();
}
