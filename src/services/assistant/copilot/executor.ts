import { db } from "@/lib/supabase";
import { OPPORTUNITY_STAGES } from "@/types";
import { dayKeyKL, FIELDS, SCAN_CAP, type Entity, type QueryPlan, type ValidFilter } from "./schema";

// EXECUTOR: runs a validated plan READ-ONLY (supabase-js .select only; no insert/update/delete/rpc, no raw SQL).
// Enum / numeric filters on real columns are pushed down as parameterised PostgREST filters; EVERY filter is then re-applied
// in code (derived fields, contains, dates), sorting, limit and all aggregates are computed in code (the LLM never does arithmetic).

export type RecordType = "contact" | "opportunity" | "activity";
export interface ResultRecord { type: RecordType; id: string; label: string; link: string; data: Record<string, string | number | null> }
export interface ExecResult {
  records: ResultRecord[];
  totalMatched: number;
  aggregates: Record<string, unknown>;
  truncated: boolean; // more matches than returned, or the scan cap was hit
  scanCapped: boolean;
}

export const fmtRM = (n: number) => `RM ${n.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
const lc = (s: unknown) => (typeof s === "string" ? s.toLowerCase() : null);
const ms = (s: unknown) => (typeof s === "string" ? Date.parse(s) : NaN);
const clip = (s: string | null | undefined, n: number) => (s == null ? null : s.length > n ? `${s.slice(0, n)}...` : s);

interface Row { f: Record<string, string | number | null>; rec: ResultRecord }
type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

/** Latest activity time per contact (an activity linked only to an opportunity counts for that opportunity's contact). */
async function lastActivityByContact(): Promise<Map<string, number>> {
  const { data, error } = await db().from("activities").select("contact_id, activity_date, opportunity:opportunities(contact_id)").limit(5000);
  if (error) throw new Error(error.message);
  const m = new Map<string, number>();
  for (const a of (data ?? []) as Raw[]) {
    const cid: string | null = a.contact_id ?? one<Raw>(a.opportunity)?.contact_id ?? null;
    const t = ms(a.activity_date);
    if (cid && Number.isFinite(t) && t > (m.get(cid) ?? -Infinity)) m.set(cid, t);
  }
  return m;
}

/** Parameterised pushdown of the simple filters (eq/neq/in on enums, comparisons on numbers) for real columns. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Q = any; // supabase-js builder generics are too deep to thread through a helper
function pushdown(q: Q, entity: Entity, filters: ValidFilter[]): Q {
  for (const f of filters) {
    if (FIELDS[entity][f.field]?.derived) continue;
    if (f.type === "enum") {
      if (f.op === "eq") q = q.eq(f.field, f.values[0]);
      else if (f.op === "neq") q = q.neq(f.field, f.values[0]);
      else if (f.op === "in") q = q.in(f.field, f.values);
    } else if (f.type === "number" && f.op !== "in" && f.op !== "neq") {
      q = q[f.op](f.field, f.values[0]);
    }
  }
  return q;
}

async function loadRows(plan: QueryPlan): Promise<{ rows: Row[]; scanCapped: boolean }> {
  const { entity, filters } = plan;
  if (entity === "contacts") {
    const [{ data, error }, last] = await Promise.all([
      pushdown(db().from("contacts").select("id,name,email,phone,company,status,created_at"), entity, filters).limit(SCAN_CAP),
      lastActivityByContact(),
    ]);
    if (error) throw new Error(error.message);
    const now = Date.now();
    const rows = ((data ?? []) as Raw[]).map<Row>((c) => {
      const la = last.get(c.id) ?? null;
      const days = la === null ? null : Math.max(0, Math.floor((now - la) / 86_400_000));
      const f = { name: c.name, email: c.email, phone: c.phone, company: c.company, status: c.status, created_at: ms(c.created_at), days_since_last_activity: days, last_activity_at: la };
      return {
        f,
        rec: {
          type: "contact", id: c.id, label: c.company ? `${c.name} (${c.company})` : c.name, link: `/contacts/${c.id}`,
          data: {
            name: c.name, company: c.company, status: c.status,
            last_activity: la === null ? "never contacted" : new Date(la).toISOString().slice(0, 10),
            days_since_last_activity: days,
            ...(plan.includeContactDetails ? { email: c.email, phone: c.phone } : {}),
          },
        },
      };
    });
    return { rows, scanCapped: (data?.length ?? 0) >= SCAN_CAP };
  }

  if (entity === "opportunities") {
    const { data, error } = await pushdown(
      db().from("opportunities").select("id,title,value_rm,stage,created_at,updated_at,contact_id,contact:contacts(id,name,company)"), entity, filters,
    ).limit(SCAN_CAP);
    if (error) throw new Error(error.message);
    const rows = ((data ?? []) as Raw[]).map<Row>((o) => {
      const c = one<Raw>(o.contact);
      const value = Number(o.value_rm);
      return {
        f: { title: o.title, value_rm: value, stage: o.stage, created_at: ms(o.created_at), updated_at: ms(o.updated_at), contact_name: c?.name ?? null, contact_company: c?.company ?? null },
        rec: {
          type: "opportunity", id: o.id, label: o.title, link: "/opportunities",
          data: { title: o.title, value: fmtRM(value), stage: o.stage, contact: c?.name ?? null, company: c?.company ?? null, created: String(o.created_at).slice(0, 10) },
        },
      };
    });
    return { rows, scanCapped: (data?.length ?? 0) >= SCAN_CAP };
  }

  const { data, error } = await pushdown(
    db().from("activities").select("id,type,activity_date,description,created_at,contact_id,contact:contacts(id,name),opportunity:opportunities(id,title)"), entity, filters,
  ).limit(SCAN_CAP);
  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as Raw[]).map<Row>((a) => {
    const c = one<Raw>(a.contact);
    const o = one<Raw>(a.opportunity);
    return {
      f: { type: a.type, activity_date: ms(a.activity_date), description: a.description, contact_name: c?.name ?? null, opportunity_title: o?.title ?? null, created_at: ms(a.created_at) },
      rec: {
        type: "activity", id: a.id, label: `${a.type}${c?.name ? ` with ${c.name}` : ""} (${String(a.activity_date).slice(0, 10)})`,
        link: a.contact_id ? `/contacts/${a.contact_id}` : "/opportunities",
        data: { type: a.type, date: String(a.activity_date).slice(0, 10), description: clip(a.description, 200), contact: c?.name ?? null, opportunity: o?.title ?? null },
      },
    };
  });
  return { rows, scanCapped: (data?.length ?? 0) >= SCAN_CAP };
}

/** Exact in-code evaluation of one filter. Never-contacted contacts: days_since_last_activity = +Infinity, last_activity_at = -Infinity. */
function test(entity: Entity, f: ValidFilter, v: string | number | null): boolean {
  if (entity === "contacts" && v === null) {
    if (f.field === "days_since_last_activity") v = Infinity;
    else if (f.field === "last_activity_at") v = -Infinity;
  }
  if (f.type === "string") {
    const s = lc(v);
    const vals = f.values as string[];
    switch (f.op) {
      case "eq": return s !== null && s === vals[0];
      case "neq": return s === null || s !== vals[0];
      case "contains": return s !== null && s.includes(vals[0]);
      case "in": return s !== null && vals.includes(s);
    }
    return false;
  }
  if (f.type === "enum") {
    const hit = (f.values as string[]).includes(v as string);
    return f.op === "neq" ? !hit : hit;
  }
  if (v === null || (typeof v === "number" && Number.isNaN(v))) return f.op === "neq";
  const n = v as number;
  const t = f.values[0] as number;
  if (f.type === "date" && f.op === "eq") return Number.isFinite(n) && dayKeyKL(n) === dayKeyKL(t);
  if (f.type === "date" && f.op === "neq") return !(Number.isFinite(n) && dayKeyKL(n) === dayKeyKL(t));
  switch (f.op) {
    case "eq": return n === t;
    case "neq": return n !== t;
    case "gt": return n > t;
    case "gte": return n >= t;
    case "lt": return n < t;
    case "lte": return n <= t;
    case "in": return (f.values as number[]).includes(n);
  }
  return false;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function execute(plan: QueryPlan): Promise<ExecResult> {
  const { rows: loaded, scanCapped } = await loadRows(plan);
  const rows = loaded.filter((r) => plan.filters.every((f) => test(plan.entity, f, r.f[f.field] ?? null)));

  const { field, dir } = plan.sort;
  const mul = dir === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    const x = a.f[field] ?? null;
    const y = b.f[field] ?? null;
    if (x === null && y === null) return 0;
    if (x === null) return 1; // nulls last
    if (y === null) return -1;
    return (typeof x === "string" && typeof y === "string" ? x.localeCompare(y, undefined, { sensitivity: "base" }) : (x as number) - (y as number)) * mul;
  });

  const totalMatched = rows.length;
  const aggregates: Record<string, unknown> = { matched_count: totalMatched };
  if (plan.entity === "opportunities" && ["sum_value", "group_by_stage"].includes(plan.aggregate)) {
    aggregates.total_value = fmtRM(round2(rows.reduce((s, r) => s + (r.f.value_rm as number), 0)));
  }
  if (plan.aggregate === "group_by_stage") {
    const g = new Map<string, { count: number; sum: number }>();
    for (const r of rows) { const e = g.get(r.f.stage as string) ?? { count: 0, sum: 0 }; e.count++; e.sum += r.f.value_rm as number; g.set(r.f.stage as string, e); }
    aggregates.by_stage = [...g].sort((a, b) => (OPPORTUNITY_STAGES as readonly string[]).indexOf(a[0]) - (OPPORTUNITY_STAGES as readonly string[]).indexOf(b[0])).map(([stage, e]) => ({ stage, count: e.count, total_value: fmtRM(round2(e.sum)) }));
  }
  if (plan.aggregate === "group_by_status") {
    const g = new Map<string, number>();
    for (const r of rows) g.set(r.f.status as string, (g.get(r.f.status as string) ?? 0) + 1);
    aggregates.by_status = [...g].map(([status, count]) => ({ status, count }));
  }

  const records = rows.slice(0, plan.limit).map((r) => r.rec);
  return { records, totalMatched, aggregates, truncated: (totalMatched > records.length && plan.limit > 0) || scanCapped, scanCapped };
}
