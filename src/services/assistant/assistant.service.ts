import { z } from "zod";
import * as contactController from "@/controllers/contact.controller";
import { REFUSAL_MESSAGE, detectInjection, guardMessages, leaksPrompt, parseMoney, sanitizeText } from "./guard";
import { SYSTEM_PROMPT, TAX_PAGE_PATH } from "./prompts";
import { extract } from "./extractor";
import { DraftSchema, normalizeStage, normalizeStatus, type Draft, type ProposalView } from "./schema";
import type { Contact } from "@/types";

export type ChatStatus = "needs_info" | "confirm" | "duplicate" | "info" | "declined";
export interface ChatResult {
  reply: string;
  status: ChatStatus;
  draft: Draft;
  missing: string[];
  proposal: ProposalView | null;
  duplicate?: Pick<Contact, "id" | "name" | "email" | "company">;
  candidates?: Pick<Contact, "id" | "name" | "email" | "company">[];
  link?: { href: string; label: string };
}

const EXAMPLE_CONTACT = 'Add Sarah Tan, sarah@acme.com, 012-345 6789, Acme Sdn Bhd, Prospect';
const EXAMPLE_OPP = 'Create an opportunity "Website redesign" worth RM 50,000 for Daniel Lim';
const CAPABILITIES = `I can add contacts and opportunities for you. Try: "${EXAMPLE_CONTACT}" or "${EXAMPLE_OPP}".`;
const emailOk = z.email().max(255);
const pick = (c: Contact) => ({ id: c.id, name: c.name, email: c.email, company: c.company });
const lc = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

const result = (r: Partial<ChatResult> & Pick<ChatResult, "reply" | "status">): ChatResult => ({ draft: {}, missing: [], proposal: null, ...r });

/** Case-insensitive lookup via the existing contact controller (name/email/company ilike), then ranked in code. */
export async function resolveContact(ref: string): Promise<{ exact: Contact[]; partial: Contact[] }> {
  const q = sanitizeText(ref, 100);
  if (!q) return { exact: [], partial: [] };
  const rows = await contactController.list({ search: q });
  const needle = lc(q);
  const exact = rows.filter((c) => lc(c.name) === needle || lc(c.email) === needle || lc(c.company) === needle);
  return { exact, partial: exact.length ? [] : rows };
}

export async function findByEmail(email: string): Promise<Contact | undefined> {
  const rows = await contactController.list({ search: email });
  return rows.find((c) => lc(c.email) === lc(email));
}

/**
 * Main entry for /chat. The LLM only EXTRACTS and CLASSIFIES; everything that decides what is missing, whether
 * a proposal exists, duplicates and contact resolution is deterministic server code (defences 3, 4).
 */
export async function converse(rawMessages: unknown, rawDraft: unknown): Promise<ChatResult> {
  const guard = guardMessages(rawMessages); // defence 2: runs before any LLM call
  if (!guard.ok) return result({ reply: guard.message, status: "declined" });
  const draftIn = DraftSchema.safeParse(rawDraft ?? {}).data ?? {};

  // Draft values come from the client, so they pass through the same injection scan.
  if (detectInjection(JSON.stringify(draftIn))) {
    console.warn("[assistant] guard: injection pattern matched in draft");
    return result({ reply: REFUSAL_MESSAGE, status: "declined" });
  }

  const out = await extract(guard.turns, Object.keys(draftIn).length ? draftIn : undefined);

  // Defence 3: scope enforcement. Out-of-scope / injection => proposal discarded, fixed polite decline.
  switch (out.intent) {
    case "injection_attempt":
      console.warn("[assistant] classifier: injection_attempt");
      return result({ reply: REFUSAL_MESSAGE, status: "declined" });
    case "out_of_scope":
      return result({ reply: `That's outside what I can do. ${CAPABILITIES}`, status: "declined", draft: draftIn });
    case "tax_question":
      return result({
        reply: "I can't answer tax questions here, but the Tax Assistant can. Meanwhile I can still add contacts and opportunities.",
        status: "declined",
        draft: draftIn,
        link: { href: TAX_PAGE_PATH, label: "Open Tax Assistant" },
      });
    case "cancel":
      return result({ reply: "No problem, I've cleared the draft. What would you like to add next?", status: "info" });
    case "smalltalk": {
      let reply = out.reply;
      // Defence 4: never let model-generated text leak the prompt / secrets or carry injected content.
      if (!reply || leaksPrompt(reply, SYSTEM_PROMPT) || detectInjection(reply)) reply = `Hi! ${CAPABILITIES}`;
      return result({ reply, status: "info", draft: draftIn });
    }
  }

  const wantsContact = out.intent === "create_contact" || out.intent === "create_both";
  const wantsOpp = out.intent === "create_opportunity" || out.intent === "create_both";

  // Cumulative values: LLM output (already merged over the dialog) falling back to the validated draft.
  const c = {
    name: out.contact_name || draftIn.contact?.name || "",
    email: out.contact_email || draftIn.contact?.email || "",
    phone: out.contact_phone || draftIn.contact?.phone || "",
    company: out.contact_company || draftIn.contact?.company || "",
    status: out.contact_status || draftIn.contact?.status || "",
  };
  const o = {
    title: out.opp_title || draftIn.opportunity?.title || "",
    value: out.opp_value || (draftIn.opportunity?.value_rm != null ? String(draftIn.opportunity.value_rm) : ""),
    stage: out.opp_stage || draftIn.opportunity?.stage || "",
    ref: out.opp_contact_ref || draftIn.opportunity?.contact_ref || "",
  };

  // Defence 6: field values are data. Reject (not store) any that look like instructions.
  if ([c.name, c.email, c.phone, c.company, o.title, o.ref].some((v) => v && detectInjection(v))) {
    console.warn("[assistant] guard: injection pattern matched in extracted field");
    return result({ reply: `One of the values looks like an instruction rather than CRM data, so I won't use it. ${REFUSAL_MESSAGE}`, status: "declined" });
  }

  const draft: Draft = {
    wants: { contact: wantsContact, opportunity: wantsOpp },
    ...(wantsContact ? { contact: { name: c.name, email: c.email, phone: c.phone, company: c.company, status: c.status } } : {}),
    ...(wantsOpp ? { opportunity: { title: o.title, value_rm: parseMoney(o.value) ?? o.value, stage: o.stage, contact_ref: wantsContact ? "" : o.ref } } : {}),
  };

  const missing: string[] = [];
  const notes: string[] = [];
  let contactOk = true;
  let oppOk = true;

  if (wantsContact) {
    if (!c.name) { missing.push("the contact's name"); contactOk = false; }
    let email = c.email;
    if (email && !emailOk.safeParse(email).success) {
      notes.push(`"${email}" doesn't look like a valid email address.`);
      email = "";
      draft.contact!.email = "";
    }
    if (!email && !c.phone && !c.company) { missing.push("at least one of email, phone or company"); contactOk = false; }
  }

  let resolved: Contact | undefined;
  let candidates: Contact[] | undefined;
  if (wantsOpp) {
    if (!o.title) { missing.push("the opportunity title"); oppOk = false; }
    const value = o.value ? parseMoney(o.value) : null;
    if (value === null) {
      missing.push("the opportunity value in RM (e.g. RM 50,000)");
      if (o.value) notes.push(`I couldn't read "${o.value}" as an amount.`);
      oppOk = false;
    }
    if (!wantsContact) {
      if (!o.ref) { missing.push("which existing contact it is for (name, email or company)"); oppOk = false; }
      else {
        const { exact, partial } = await resolveContact(o.ref);
        const pool = exact.length ? exact : partial;
        if (pool.length === 1) resolved = pool[0];
        else if (pool.length > 1) {
          candidates = pool.slice(0, 5);
          missing.push("which of the matching contacts you mean");
          oppOk = false;
        } else {
          notes.push(`I couldn't find a contact matching "${o.ref}".`);
          missing.push("an existing contact, or the new contact's details (name plus email, phone or company) so I can create them first");
          oppOk = false;
        }
      }
    }
  }

  // Duplicate check (same email) before offering a contact proposal.
  if (wantsContact && contactOk && draft.contact!.email) {
    const dup = await findByEmail(draft.contact!.email);
    if (dup) {
      return result({
        status: "duplicate",
        reply: `A contact with the email ${dup.email} already exists: ${dup.name}${dup.company ? ` (${dup.company})` : ""}. I won't create a duplicate.${wantsOpp ? " I can attach the opportunity to the existing contact instead." : ""}`,
        draft,
        duplicate: pick(dup),
        link: { href: `/contacts/${dup.id}`, label: "View existing contact" },
      });
    }
  }

  if (missing.length || !contactOk || !oppOk) {
    const known: string[] = [];
    if (wantsContact && c.name) known.push(`name ${c.name}`);
    if (wantsContact && c.email) known.push(`email ${c.email}`);
    if (wantsContact && c.phone) known.push(`phone ${c.phone}`);
    if (wantsContact && c.company) known.push(`company ${c.company}`);
    if (wantsOpp && o.title) known.push(`opportunity "${o.title}"`);
    const example = wantsContact && wantsOpp
      ? 'Add Sarah Tan (sarah@acme.com, Acme Sdn Bhd) with an opportunity "ERP rollout" worth RM 120,000'
      : wantsOpp ? EXAMPLE_OPP : EXAMPLE_CONTACT;
    const reply = [
      ...notes,
      known.length ? `So far I have: ${known.join(", ")}.` : "Happy to help with that.",
      `To continue I still need ${missing.join("; ")}.`,
      `For example: "${example}"`,
    ].filter(Boolean).join(" ");
    return result({ reply, status: "needs_info", draft, missing, ...(candidates ? { candidates: candidates.map(pick) } : {}) });
  }

  // Sufficient: build the proposal (defence 4: whitelist + enums + money parse; extra fields never copied).
  const contactData = wantsContact
    ? { name: c.name, email: draft.contact!.email || null, phone: c.phone || null, company: c.company || null, status: normalizeStatus(c.status) ?? "Lead" }
    : undefined;
  const oppData = wantsOpp
    ? { title: o.title, value_rm: parseMoney(o.value) ?? 0, stage: normalizeStage(o.stage) ?? "New" }
    : undefined;

  const proposal: ProposalView =
    wantsContact && wantsOpp
      ? { proposal: { kind: "both", data: { contact: contactData!, opportunity: oppData! } } as ProposalView["proposal"] }
      : wantsContact
        ? { proposal: { kind: "contact", data: contactData! } as ProposalView["proposal"] }
        : {
            proposal: { kind: "opportunity", data: { contact_id: resolved!.id, ...oppData! } } as ProposalView["proposal"],
            display: { contact_name: resolved!.name, contact_company: resolved!.company },
          };

  const what = wantsContact && wantsOpp ? "this contact and opportunity" : wantsContact ? "this contact" : "this opportunity";
  return result({ status: "confirm", reply: `Please review ${what}. Nothing is saved until you confirm.`, draft, proposal });
}
