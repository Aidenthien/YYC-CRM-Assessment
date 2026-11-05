import { db } from "@/lib/supabase";
import type { Activity } from "@/types";

export async function countContacts(): Promise<number> {
  const { count, error } = await db().from("contacts").select("id", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function opportunityValues(): Promise<{ stage: string; value_rm: number }[]> {
  const { data, error } = await db().from("opportunities").select("stage, value_rm");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ stage: r.stage as string, value_rm: Number(r.value_rm) }));
}

export async function recentActivities(limit: number): Promise<Activity[]> {
  const { data, error } = await db()
    .from("activities")
    .select("*, contact:contacts(id,name), opportunity:opportunities(id,title)")
    .order("activity_date", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data as unknown as Activity[];
}
