import { db } from "@/lib/supabase";
import { HttpError } from "@/lib/http";
import type { Activity } from "@/types";

const T = "activities";
const SELECT = "*, contact:contacts(id,name), opportunity:opportunities(id,title)";

export async function list(filter: { contact_id?: string; opportunity_id?: string; limit?: number }): Promise<Activity[]> {
  let q = db().from(T).select(SELECT).order("activity_date", { ascending: false });
  if (filter.contact_id) q = q.eq("contact_id", filter.contact_id);
  if (filter.opportunity_id) q = q.eq("opportunity_id", filter.opportunity_id);
  if (filter.limit) q = q.limit(filter.limit);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data as unknown as Activity[];
}

export async function insert(input: Partial<Activity>): Promise<Activity> {
  const { data, error } = await db().from(T).insert(input).select(SELECT).single();
  if (error) throw new Error(error.message);
  return data as unknown as Activity;
}

export async function remove(id: string): Promise<void> {
  const { data, error } = await db().from(T).delete().eq("id", id).select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new HttpError("Activity not found", 404);
}
