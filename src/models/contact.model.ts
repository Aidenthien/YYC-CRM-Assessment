import { db } from "@/lib/supabase";
import { HttpError } from "@/lib/http";
import type { Contact } from "@/types";

const T = "contacts";

export async function list(filter: { search?: string; status?: string }): Promise<Contact[]> {
  let q = db().from(T).select("*").order("created_at", { ascending: false });
  if (filter.status) q = q.eq("status", filter.status);
  if (filter.search) {
    // strip chars that have meaning in PostgREST or() syntax / LIKE wildcards
    const s = filter.search.replace(/[,()%*_\\]/g, " ").trim();
    if (s) q = q.or(`name.ilike.%${s}%,email.ilike.%${s}%,company.ilike.%${s}%`);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data as Contact[];
}

export async function findById(id: string): Promise<Contact> {
  const { data, error } = await db().from(T).select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new HttpError("Contact not found", 404);
  return data as Contact;
}

export async function insert(input: Partial<Contact>): Promise<Contact> {
  const { data, error } = await db().from(T).insert(input).select().single();
  if (error) throw new Error(error.message);
  return data as Contact;
}

export async function update(id: string, patch: Partial<Contact>): Promise<Contact> {
  const { data, error } = await db()
    .from(T)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new HttpError("Contact not found", 404);
  return data as Contact;
}

export async function remove(id: string): Promise<void> {
  const { data, error } = await db().from(T).delete().eq("id", id).select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new HttpError("Contact not found", 404);
}
