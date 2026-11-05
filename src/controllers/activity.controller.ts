import { z } from "zod";
import { ACTIVITY_TYPES } from "@/types";
import { HttpError } from "@/lib/http";
import * as activities from "@/models/activity.model";
import * as opportunities from "@/models/opportunity.model";
import * as contacts from "@/models/contact.model";

const uuid = (name: string) => z.uuid({ error: `Invalid ${name}` });
const optUuid = (name: string) =>
  z.preprocess((v) => (v === "" ? undefined : v), uuid(name).nullable().optional());

const createSchema = z.object({
  contact_id: optUuid("contact_id"),
  opportunity_id: optUuid("opportunity_id"),
  type: z.enum(ACTIVITY_TYPES),
  activity_date: z.iso.datetime({ offset: true }).optional(),
  description: z.string().trim().max(5000).default(""),
});

const listSchema = z.object({
  contact_id: uuid("contact_id").optional(),
  opportunity_id: uuid("opportunity_id").optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export const list = (query: unknown) => activities.list(listSchema.parse(query));

export async function create(body: unknown) {
  const input = createSchema.parse(body);
  if (!input.contact_id && !input.opportunity_id)
    throw new HttpError("An activity requires contact_id or opportunity_id", 422);

  let contact_id = input.contact_id ?? null;
  const opportunity_id = input.opportunity_id ?? null;
  if (opportunity_id) {
    const opp = await opportunities.findById(opportunity_id);
    if (!contact_id) contact_id = opp.contact_id;
  }
  if (contact_id) await contacts.findById(contact_id);

  return activities.insert({
    contact_id,
    opportunity_id,
    type: input.type,
    description: input.description,
    ...(input.activity_date ? { activity_date: input.activity_date } : {}),
  });
}

export async function remove(rawId: string) {
  const id = uuid("id").parse(rawId);
  await activities.remove(id);
  return { id };
}
