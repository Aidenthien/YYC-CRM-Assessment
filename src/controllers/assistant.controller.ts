import { z } from "zod";
import { HttpError } from "@/lib/http";
import * as contactController from "@/controllers/contact.controller";
import * as opportunityController from "@/controllers/opportunity.controller";
import { converse, findByEmail } from "@/services/assistant/assistant.service";
import { rateLimit } from "@/services/assistant/guard";
import { ProposalSchema } from "@/services/assistant/schema";
import type { Contact, Opportunity } from "@/types";

export function clientKey(h: Headers) {
  return h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "local";
}

/** Defence 5: token bucket per client (20/min). The same bucket covers /chat and /commit. */
function throttle(clientKey: string) {
  const r = rateLimit(clientKey);
  if (!r.allowed) throw new HttpError(`You're sending messages too quickly. Please wait ${r.retryAfterSec}s and try again.`, 429);
}

const chatBody = z.object({ messages: z.unknown(), draft: z.unknown().optional() });

export async function chat(body: unknown, clientKey: string) {
  throttle(clientKey);
  const parsed = chatBody.safeParse(body);
  if (!parsed.success) throw new HttpError("Invalid request", 400);
  return converse(parsed.data.messages, parsed.data.draft);
}

export interface CommitResult {
  kind: "contact" | "opportunity" | "both";
  contact?: Contact;
  opportunity?: Opportunity;
  link: { href: string; label: string };
}

/**
 * The ONLY write path of the assistant. Runs after an explicit user click on Confirm (human-in-the-loop);
 * the LLM is never involved. The proposal is re-validated (whitelist, unknown keys dropped) and then saved through
 * the regular contact/opportunity controllers, which apply their own zod schemas again.
 */
export async function commit(body: unknown, clientKey: string): Promise<CommitResult> {
  throttle(clientKey);
  const parsed = z.object({ proposal: ProposalSchema }).safeParse(body);
  if (!parsed.success) throw parsed.error;
  const { proposal } = parsed.data;

  if (proposal.kind === "opportunity") {
    const opportunity = await opportunityController.create(proposal.data);
    return { kind: "opportunity", opportunity, link: { href: `/contacts/${opportunity.contact_id}`, label: "View contact" } };
  }

  const cdata = proposal.kind === "contact" ? proposal.data : proposal.data.contact;
  if (cdata.email) {
    const dup = await findByEmail(cdata.email);
    if (dup) throw new HttpError(`A contact with the email ${dup.email} already exists (${dup.name}).`, 409);
  }
  const contact = await contactController.create(cdata);
  if (proposal.kind === "contact") return { kind: "contact", contact, link: { href: `/contacts/${contact.id}`, label: "View contact" } };

  try {
    const opportunity = await opportunityController.create({ ...proposal.data.opportunity, contact_id: contact.id });
    return { kind: "both", contact, opportunity, link: { href: `/contacts/${contact.id}`, label: "View contact" } };
  } catch (e) {
    await contactController.remove(contact.id).catch(() => undefined); // don't leave a half-created pair behind
    throw e;
  }
}
