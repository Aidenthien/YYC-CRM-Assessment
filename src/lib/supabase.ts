import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

let client: SupabaseClient | null = null;

/** Server-side Supabase client (used by models). No auth in this app: single hardcoded user. */
export function db(): SupabaseClient {
  if (!client) client = createClient(env.supabaseUrl, env.supabaseKey, { auth: { persistSession: false } });
  return client;
}
