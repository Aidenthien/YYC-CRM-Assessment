import { Type } from "@google/genai";
import { z } from "zod";
import { CONTACT_STATUSES, OPPORTUNITY_STAGES } from "@/types";
import { sanitizeText, parseMoney } from "./guard";

// ---------------- LLM output (defence 3 + 4) ----------------
export const INTENTS = [
  "create_contact",
  "create_opportunity",
  "create_both",
  "cancel",
  "smalltalk",
  "tax_question",
  "out_of_scope",
  "injection_attempt",
] as const;
export type Intent = (typeof INTENTS)[number];

/** Every LLM string is clamped + sanitised; anything malformed collapses to "" (= "not provided"). */
const text = (max: number) => z.string().transform((v) => sanitizeText(v, max)).catch("");

export const LlmOutput = z.object({
  intent: z.enum(INTENTS).catch("out_of_scope"), // unknown intent => treated as out of scope (fail closed)
  reply: text(500),
  contact_name: text(255),
  contact_email: text(255),
  contact_phone: text(60),
  contact_company: text(255),
  contact_status: text(20),
  opp_title: text(255),
  opp_value: text(40),
  opp_stage: text(20),
  opp_contact_ref: text(255),
});
export type LlmOutput = z.infer<typeof LlmOutput>;

// Gemini enforces this JSON shape (responseMimeType + responseSchema); the zod parse above re-checks it.
const str = { type: Type.STRING };
export const responseSchema = {
  type: Type.OBJECT,
  properties: {
    intent: { type: Type.STRING, enum: [...INTENTS] },
    reply: str,
    contact_name: str,
    contact_email: str,
    contact_phone: str,
    contact_company: str,
    contact_status: str,
    opp_title: str,
    opp_value: str,
    opp_stage: str,
    opp_contact_ref: str,
  },
  required: ["intent", "reply", "contact_name", "contact_email", "contact_phone", "contact_company", "contact_status", "opp_title", "opp_value", "opp_stage", "opp_contact_ref"],
  propertyOrdering: ["intent", "reply", "contact_name", "contact_email", "contact_phone", "contact_company", "contact_status", "opp_title", "opp_value", "opp_stage", "opp_contact_ref"],
};

// ---------------- Draft (round-tripped through the client => untrusted, re-validated every time) ----------------
const optStr = (max: number) => z.string().optional().transform((v) => (v ? sanitizeText(v, max) : "")).catch("");
export const DraftSchema = z
  .object({
    contact: z
      .object({ name: optStr(255), email: optStr(255), phone: optStr(60), company: optStr(255), status: optStr(20) })
      .optional()
      .catch(undefined),
    opportunity: z
      .object({ title: optStr(255), value_rm: z.union([z.number(), z.string()]).optional().catch(undefined), stage: optStr(20), contact_ref: optStr(255) })
      .optional()
      .catch(undefined),
    wants: z.object({ contact: z.boolean().catch(false), opportunity: z.boolean().catch(false) }).optional().catch(undefined),
  })
  .strip(); // unknown keys are dropped (whitelist)
export type Draft = z.infer<typeof DraftSchema>;

// ---------------- Proposal (what may be written; whitelist, validated like the controllers) ----------------
const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const optText = z.preprocess(blank, z.string().trim().max(255).nullable().optional());

export const ContactData = z.object({
  name: z.string().trim().min(1, "Name is required").max(255),
  email: z.preprocess(blank, z.email().max(255).nullable().optional()),
  phone: z.preprocess(blank, z.string().trim().max(60).nullable().optional()),
  company: optText,
  status: z.enum(CONTACT_STATUSES).default("Lead"),
});
export const OpportunityData = z.object({
  contact_id: z.uuid({ error: "Invalid contact_id" }),
  title: z.string().trim().min(1, "Title is required").max(255),
  value_rm: z.coerce.number().min(0, "value_rm must be >= 0").max(1e12).default(0),
  stage: z.enum(OPPORTUNITY_STAGES).default("New"),
});
export const NewOpportunityData = OpportunityData.omit({ contact_id: true });

/** Shape accepted by POST /commit. Unknown keys are stripped (z.object strips by default). */
export const ProposalSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("contact"), data: ContactData }),
  z.object({ kind: z.literal("opportunity"), data: OpportunityData }),
  z.object({ kind: z.literal("both"), data: z.object({ contact: ContactData, opportunity: NewOpportunityData }) }),
]);
export type Proposal = z.infer<typeof ProposalSchema>;

/** Display-only extras for the confirmation card (never trusted on commit). */
export interface ProposalView {
  proposal: Proposal;
  display?: { contact_name?: string; contact_company?: string | null };
}

export function normalizeStatus(v: string | undefined) {
  return CONTACT_STATUSES.find((s) => s.toLowerCase() === (v ?? "").trim().toLowerCase());
}
export function normalizeStage(v: string | undefined) {
  return OPPORTUNITY_STAGES.find((s) => s.toLowerCase() === (v ?? "").trim().toLowerCase());
}
export { parseMoney };
