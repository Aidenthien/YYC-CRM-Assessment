import { z } from "zod";
import { CONTACT_STATUSES } from "@/types";
import * as contacts from "@/models/contact.model";
import * as opportunities from "@/models/opportunity.model";
import * as activities from "@/models/activity.model";

const idSchema = z.uuid({ error: "Invalid id" });
const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const optText = z.preprocess(blankToNull, z.string().trim().max(255).nullable().optional());

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(255),
  email: z.preprocess(blankToNull, z.email().max(255).nullable().optional()),
  phone: optText,
  company: optText,
  status: z.enum(CONTACT_STATUSES).default("Lead"),
});
const updateSchema = createSchema.partial();

const listSchema = z.object({
  search: z.string().trim().optional(),
  status: z.enum(CONTACT_STATUSES).optional(),
});

export const list = (query: unknown) => contacts.list(listSchema.parse(query));

export async function get(rawId: string) {
  const id = idSchema.parse(rawId);
  const [contact, opps, acts] = await Promise.all([
    contacts.findById(id),
    opportunities.list({ contact_id: id }),
    activities.list({ contact_id: id }),
  ]);
  return { ...contact, opportunities: opps, activities: acts };
}

export const create = (body: unknown) => contacts.insert(createSchema.parse(body));

export async function update(rawId: string, body: unknown) {
  const id = idSchema.parse(rawId);
  return contacts.update(id, updateSchema.parse(body));
}

export async function remove(rawId: string) {
  const id = idSchema.parse(rawId);
  await contacts.remove(id);
  return { id };
}
