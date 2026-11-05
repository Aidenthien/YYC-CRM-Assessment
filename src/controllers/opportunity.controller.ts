import { z } from "zod";
import { OPPORTUNITY_STAGES } from "@/types";
import * as opportunities from "@/models/opportunity.model";
import * as contacts from "@/models/contact.model";

const idSchema = z.uuid({ error: "Invalid id" });

const createSchema = z.object({
  contact_id: z.uuid({ error: "Invalid contact_id" }),
  title: z.string().trim().min(1, "Title is required").max(255),
  value_rm: z.coerce.number().min(0, "value_rm must be >= 0").default(0),
  stage: z.enum(OPPORTUNITY_STAGES).default("New"),
});
const updateSchema = createSchema.partial();

const listSchema = z.object({
  contact_id: z.uuid({ error: "Invalid contact_id" }).optional(),
  stage: z.enum(OPPORTUNITY_STAGES).optional(),
});

export const list = (query: unknown) => opportunities.list(listSchema.parse(query));
export const get = (rawId: string) => opportunities.findById(idSchema.parse(rawId));

export async function create(body: unknown) {
  const input = createSchema.parse(body);
  await contacts.findById(input.contact_id); // 404 if contact missing
  return opportunities.insert(input);
}

export async function update(rawId: string, body: unknown) {
  const id = idSchema.parse(rawId);
  const patch = updateSchema.parse(body);
  if (patch.contact_id) await contacts.findById(patch.contact_id);
  return opportunities.update(id, patch);
}

export async function remove(rawId: string) {
  const id = idSchema.parse(rawId);
  await opportunities.remove(id);
  return { id };
}
