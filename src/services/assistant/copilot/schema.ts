import { Type } from "@google/genai";
import { z } from "zod";
import { ACTIVITY_TYPES, CONTACT_STATUSES, OPPORTUNITY_STAGES } from "@/types";
import { parseMoney, sanitizeText } from "../guard";

// The copilot never writes SQL. The planner LLM emits a QUERY PLAN that is validated against this whitelist.

export const ENTITIES = ["contacts", "opportunities", "activities"] as const;
export type Entity = (typeof ENTITIES)[number];
export const OPS = ["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains"] as const;
export type Op = (typeof OPS)[number];
export const AGGREGATES = ["none", "count", "sum_value", "group_by_stage", "group_by_status"] as const;
export type Aggregate = (typeof AGGREGATES)[number];

export const MAX_LIMIT = 50;
export const DEFAULT_LIMIT = 20;
export const MAX_FILTERS = 8;
export const SCAN_CAP = 1000; // max rows read per query

type FieldType = "string" | "number" | "date" | "enum";
interface FieldDef { type: FieldType; values?: readonly string[]; derived?: boolean }

export const FIELDS: Record<Entity, Record<string, FieldDef>> = {
  contacts: {
    name: { type: "string" }, email: { type: "string" }, phone: { type: "string" }, company: { type: "string" },
    status: { type: "enum", values: CONTACT_STATUSES }, created_at: { type: "date" },
    days_since_last_activity: { type: "number", derived: true }, last_activity_at: { type: "date", derived: true },
  },
  opportunities: {
    title: { type: "string" }, value_rm: { type: "number" }, stage: { type: "enum", values: OPPORTUNITY_STAGES },
    created_at: { type: "date" }, updated_at: { type: "date" }, contact_name: { type: "string", derived: true }, contact_company: { type: "string", derived: true },
  },
  activities: {
    type: { type: "enum", values: ACTIVITY_TYPES }, activity_date: { type: "date" }, description: { type: "string" },
    contact_name: { type: "string", derived: true }, opportunity_title: { type: "string", derived: true }, created_at: { type: "date" },
  },
};
export const ALL_FIELDS = [...new Set(ENTITIES.flatMap((e) => Object.keys(FIELDS[e])))];

const OPS_BY_TYPE: Record<FieldType, readonly Op[]> = {
  string: ["eq", "neq", "contains", "in"],
  enum: ["eq", "neq", "in"],
  number: ["eq", "neq", "gt", "gte", "lt", "lte", "in"],
  date: ["eq", "neq", "gt", "gte", "lt", "lte"],
};
const AGG_ENTITY: Partial<Record<Aggregate, Entity>> = { sum_value: "opportunities", group_by_stage: "opportunities", group_by_status: "contacts" };

// ---------------- planner output (raw) ----------------
export const RawPlan = z.object({
  supported: z.boolean().catch(false),
  unsupported_reason: z.string().transform((v) => sanitizeText(v, 200)).catch(""),
  entity: z.string().catch("none"),
  filters: z.array(z.object({ field: z.string(), op: z.string(), values: z.array(z.union([z.string(), z.number()])).max(10) })).max(MAX_FILTERS).catch([]),
  include_contact_details: z.boolean().catch(false),
  sort_field: z.string().catch(""),
  sort_direction: z.string().catch("desc"),
  limit: z.number().catch(DEFAULT_LIMIT),
  aggregate: z.string().catch("none"),
});

export const plannerResponseSchema = {
  type: Type.OBJECT,
  properties: {
    supported: { type: Type.BOOLEAN },
    unsupported_reason: { type: Type.STRING },
    entity: { type: Type.STRING, enum: [...ENTITIES, "none"] },
    filters: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          field: { type: Type.STRING, enum: ALL_FIELDS },
          op: { type: Type.STRING, enum: [...OPS] },
          values: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["field", "op", "values"],
      },
    },
    include_contact_details: { type: Type.BOOLEAN },
    sort_field: { type: Type.STRING },
    sort_direction: { type: Type.STRING, enum: ["asc", "desc"] },
    limit: { type: Type.INTEGER },
    aggregate: { type: Type.STRING, enum: [...AGGREGATES] },
  },
  required: ["supported", "unsupported_reason", "entity", "filters", "include_contact_details", "sort_field", "sort_direction", "limit", "aggregate"],
  propertyOrdering: ["supported", "unsupported_reason", "entity", "filters", "include_contact_details", "sort_field", "sort_direction", "limit", "aggregate"],
};

// ---------------- validated plan ----------------
export interface ValidFilter { field: string; op: Op; type: FieldType; values: (string | number)[]; raw: string[] }
export interface QueryPlan {
  entity: Entity;
  filters: ValidFilter[];
  includeContactDetails: boolean;
  sort: { field: string; dir: "asc" | "desc" };
  limit: number;
  aggregate: Aggregate;
}

// ---- relative / absolute date resolution (server side; Malaysia time, UTC+8, no DST) ----
const DAY = 86_400_000;
const KL = 8 * 3_600_000;
export const startOfDayKL = (ms: number) => Math.floor((ms + KL) / DAY) * DAY - KL;
export const dayKeyKL = (ms: number) => Math.floor((ms + KL) / DAY);
export const todayKL = (now = Date.now()) => new Date(now + KL).toISOString().slice(0, 10);
const UNIT_DAYS: Record<string, number> = { day: 1, week: 7, fortnight: 14, month: 30, year: 365 };

/** "14 days ago", "2 weeks ago", "last month", "today", "yesterday", "3 days from now", "2026-11-01". Throws on anything else. */
export function resolveDate(input: string | number, now = Date.now()): number {
  const s = String(input).trim().toLowerCase();
  if (s === "today" || s === "now") return startOfDayKL(now);
  if (s === "yesterday") return startOfDayKL(now) - DAY;
  if (s === "tomorrow") return startOfDayKL(now) + DAY;
  let m = s.match(/^(\d{1,4}|a|an|one)\s+(day|week|fortnight|month|year)s?\s+(ago|from now|ahead|later)$/);
  if (m) {
    const n = /^\d/.test(m[1]) ? Number(m[1]) : 1;
    return now + (m[3] === "ago" ? -1 : 1) * n * UNIT_DAYS[m[2]] * DAY;
  }
  m = s.match(/^(last|previous)\s+(week|month|year)$/);
  if (m) return now - UNIT_DAYS[m[2]] * DAY;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:t[\d:.]+z?)?$/);
  if (m) {
    const ms = Date.parse(`${m[1]}-${m[2]}-${m[3]}T00:00:00+08:00`);
    if (Number.isFinite(ms)) return ms;
  }
  throw new Error(`unsupported date "${s.slice(0, 40)}"`);
}

export class PlanError extends Error {}

/** Validate a raw planner output against the whitelist. Throws PlanError on unknown entity/field/op/value. */
export function validatePlan(raw: z.infer<typeof RawPlan>, now = Date.now()): QueryPlan {
  if (!(ENTITIES as readonly string[]).includes(raw.entity)) throw new PlanError("unknown entity");
  const entity = raw.entity as Entity;
  const defs = FIELDS[entity];

  const filters: ValidFilter[] = raw.filters.map((f) => {
    const def = defs[f.field];
    if (!def) throw new PlanError(`unknown field ${f.field} for ${entity}`);
    if (!(OPS as readonly string[]).includes(f.op)) throw new PlanError(`unknown op ${f.op}`);
    const op = f.op as Op;
    if (!OPS_BY_TYPE[def.type].includes(op)) throw new PlanError(`op ${op} not allowed on ${f.field}`);
    const rawVals = f.values.map((v) => sanitizeText(String(v), 100)).filter((v) => v !== "");
    if (!rawVals.length) throw new PlanError(`no value for ${f.field}`);
    if (op !== "in" && rawVals.length !== 1) throw new PlanError(`op ${op} takes one value`);
    let values: (string | number)[];
    switch (def.type) {
      case "enum":
        values = rawVals.map((v) => {
          const c = def.values!.find((x) => x.toLowerCase() === v.toLowerCase());
          if (!c) throw new PlanError(`bad ${f.field} value ${v}`);
          return c;
        });
        break;
      case "number":
        values = rawVals.map((v) => {
          const n = parseMoney(v);
          if (n === null) throw new PlanError(`bad number ${v}`);
          return n;
        });
        break;
      case "date":
        values = rawVals.map((v) => {
          try { return resolveDate(v, now); } catch { throw new PlanError(`bad date ${v}`); }
        });
        break;
      default:
        values = rawVals.map((v) => v.toLowerCase());
    }
    return { field: f.field, op, type: def.type, values, raw: rawVals };
  });

  const aggregate = (AGGREGATES as readonly string[]).includes(raw.aggregate) ? (raw.aggregate as Aggregate) : (() => { throw new PlanError("unknown aggregate"); })();
  const need = AGG_ENTITY[aggregate];
  if (need && need !== entity) throw new PlanError(`${aggregate} needs ${need}`);

  const sortField = raw.sort_field && defs[raw.sort_field] ? raw.sort_field : raw.sort_field ? (() => { throw new PlanError(`unknown sort field ${raw.sort_field}`); })() : "";
  const defaultSort = entity === "contacts" ? "name" : entity === "opportunities" ? "value_rm" : "activity_date";
  const dir = raw.sort_direction === "asc" ? "asc" : "desc";

  let limit = Number.isFinite(raw.limit) ? Math.floor(raw.limit) : DEFAULT_LIMIT;
  limit = limit <= 0 ? (aggregate === "none" ? DEFAULT_LIMIT : 0) : Math.min(limit, MAX_LIMIT);

  return {
    entity, filters, aggregate, limit,
    includeContactDetails: entity === "contacts" && raw.include_contact_details,
    sort: { field: sortField || defaultSort, dir: sortField ? dir : entity === "contacts" ? "asc" : "desc" },
  };
}

// ---------------- plan summary (server-written, deterministic) ----------------
const OP_WORDS: Record<Op, string> = { eq: "is", neq: "is not", gt: "is more than", gte: "is at least", lt: "is less than", lte: "is at most", in: "is one of", contains: "contains" };
const humanField = (f: string) => f.replace(/_/g, " ");

export function describePlan(p: QueryPlan): string {
  const where = p.filters.map((f) => `${humanField(f.field)} ${OP_WORDS[f.op]} ${f.raw.join(" / ")}`);
  const agg: Record<Aggregate, string> = { none: "", count: " (count)", sum_value: " (total value)", group_by_stage: " (grouped by stage)", group_by_status: " (grouped by status)" };
  return `${p.entity[0].toUpperCase()}${p.entity.slice(1)}${where.length ? ` where ${where.join(" and ")}` : ""}${agg[p.aggregate]}${p.limit ? `, sorted by ${humanField(p.sort.field)} ${p.sort.dir === "asc" ? "ascending" : "descending"}, up to ${p.limit}` : ""}`;
}
