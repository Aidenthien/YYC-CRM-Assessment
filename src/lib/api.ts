import type {
  Activity,
  ActivityType,
  Citation,
  Contact,
  ContactStatus,
  DashboardStats,
  Opportunity,
  OpportunityStage,
  RagAnswer,
  TaxDocument,
} from "@/types";

export type ContactDetail = Contact & { opportunities: Opportunity[]; activities: Activity[] };

export interface RagHistoryItem {
  id: string;
  contact_id: string | null;
  question: string;
  answer: string;
  citations: Citation[];
  answerable: boolean;
  created_at: string;
}

export interface ContactInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  status: ContactStatus;
}

export interface OpportunityInput {
  title: string;
  value_rm: number;
  stage: OpportunityStage;
  contact_id: string;
}

export interface ActivityInput {
  type: ActivityType;
  activity_date?: string;
  description: string;
  contact_id?: string;
  opportunity_id?: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      cache: "no-store",
    });
  } catch {
    throw new Error("Network error: could not reach the server.");
  }
  let body: { data?: T; error?: string } | null = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON response */
  }
  if (!res.ok || !body || body.error) {
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return body.data as T;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

function qs(params: Record<string, string | number | undefined | null>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  dashboard: () => request<DashboardStats>("/api/dashboard"),

  contacts: (p: { search?: string; status?: string } = {}) => request<Contact[]>(`/api/contacts${qs(p)}`),
  contact: (id: string) => request<ContactDetail>(`/api/contacts/${id}`),
  createContact: (b: ContactInput) => request<Contact>("/api/contacts", json("POST", b)),
  updateContact: (id: string, b: Partial<ContactInput>) => request<Contact>(`/api/contacts/${id}`, json("PUT", b)),
  deleteContact: (id: string) => request<unknown>(`/api/contacts/${id}`, json("DELETE")),

  opportunities: (p: { contact_id?: string; stage?: string } = {}) =>
    request<Opportunity[]>(`/api/opportunities${qs(p)}`),
  createOpportunity: (b: OpportunityInput) => request<Opportunity>("/api/opportunities", json("POST", b)),
  updateOpportunity: (id: string, b: Partial<OpportunityInput>) =>
    request<Opportunity>(`/api/opportunities/${id}`, json("PUT", b)),
  deleteOpportunity: (id: string) => request<unknown>(`/api/opportunities/${id}`, json("DELETE")),

  createActivity: (b: ActivityInput) => request<Activity>("/api/activities", json("POST", b)),
  deleteActivity: (id: string) => request<unknown>(`/api/activities/${id}`, json("DELETE")),

  ask: (b: { question: string; contact_id?: string; category?: string }) =>
    request<RagAnswer>("/api/rag/ask", json("POST", b)),
  ragHistory: (p: { contact_id?: string; limit?: number } = {}) =>
    request<RagHistoryItem[]>(`/api/rag/history${qs(p)}`),
  ragDocuments: () => request<TaxDocument[]>("/api/rag/documents"),
};
