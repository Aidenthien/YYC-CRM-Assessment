import { z } from "zod";
import { OPPORTUNITY_STAGES } from "@/types";
import * as opportunities from "@/models/opportunity.model";
import * as contacts from "@/models/contact.model";

const idSchema = z.uuid({ error: "Invalid id" });

const baseSchema = z.object({
  contact_id: z.uuid({ error: "Invalid contact_id" }),
  title: z.string().trim().min(1, "Title is required").max(255),
  value_rm: z.coerce.number().min(0, "value_rm must be >= 0"),
  stage: z.enum(OPPORTUNITY_STAGES),
});
// Defaults apply on create only. Update must stay strictly partial: a stage-only PUT (Kanban drag)
// must not reset value_rm to 0.
const createSchema = baseSchema.extend({
  value_rm: baseSchema.shape.value_rm.default(0),
  stage: baseSchema.shape.stage.default("New"),
});
const updateSchema = baseSchema.partial();

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
