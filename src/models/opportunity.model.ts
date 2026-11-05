import { db } from "@/lib/supabase";
import { HttpError } from "@/lib/http";
import type { Opportunity } from "@/types";

const T = "opportunities";
const SELECT = "*, contact:contacts(id,name,company)";

export async function list(filter: { contact_id?: string; stage?: string }): Promise<Opportunity[]> {
  let q = db().from(T).select(SELECT).order("created_at", { ascending: false });
  if (filter.contact_id) q = q.eq("contact_id", filter.contact_id);
  if (filter.stage) q = q.eq("stage", filter.stage);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data as unknown as Opportunity[];
}

export async function findById(id: string): Promise<Opportunity> {
  const { data, error } = await db().from(T).select(SELECT).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new HttpError("Opportunity not found", 404);
  return data as unknown as Opportunity;
}

export async function insert(input: Partial<Opportunity>): Promise<Opportunity> {
  const { data, error } = await db().from(T).insert(input).select(SELECT).single();
  if (error) throw new Error(error.message);
  return data as unknown as Opportunity;
}

export async function update(id: string, patch: Partial<Opportunity>): Promise<Opportunity> {
  const { data, error } = await db()
    .from(T)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(SELECT)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new HttpError("Opportunity not found", 404);
  return data as unknown as Opportunity;
}

export async function remove(id: string): Promise<void> {
  const { data, error } = await db().from(T).delete().eq("id", id).select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new HttpError("Opportunity not found", 404);
}
