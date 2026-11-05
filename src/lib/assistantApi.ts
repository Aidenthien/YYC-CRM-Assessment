import type { Contact, ContactStatus, Opportunity, OpportunityStage } from "@/types";

// Client-side contract for /api/assistant/*. (Own file: src/lib/api.ts is owned by another agent.)

export interface AssistantTurn { role: "user" | "assistant"; content: string }

export type ContactData = { name: string; email?: string | null; phone?: string | null; company?: string | null; status: ContactStatus };
export type OpportunityNew = { title: string; value_rm: number; stage: OpportunityStage };
export type Proposal =
  | { kind: "contact"; data: ContactData }
  | { kind: "opportunity"; data: OpportunityNew & { contact_id: string } }
  | { kind: "both"; data: { contact: ContactData; opportunity: OpportunityNew } };

export interface ProposalView { proposal: Proposal; display?: { contact_name?: string; contact_company?: string | null } }
export type ContactRef = Pick<Contact, "id" | "name" | "email" | "company">;

export interface ChatResponse {
  reply: string;
  status: "needs_info" | "confirm" | "duplicate" | "info" | "declined";
  draft: Record<string, unknown>;
  missing: string[];
  proposal: ProposalView | null;
  duplicate?: ContactRef;
  candidates?: ContactRef[];
  link?: { href: string; label: string };
}

export interface CommitResponse {
  kind: "contact" | "opportunity" | "both";
  contact?: Contact;
  opportunity?: Opportunity;
  link: { href: string; label: string };
}

async function post<T>(url: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("Can't reach the server. Check your connection and try again.");
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
  return json.data as T;
}

export const assistantApi = {
  chat: (messages: AssistantTurn[], draft?: Record<string, unknown>) =>
    post<ChatResponse>("/api/assistant/chat", { messages: messages.slice(-12), draft }),
  commit: (proposal: Proposal) => post<CommitResponse>("/api/assistant/commit", { proposal }),
};

/** Fired after the assistant saves something; list pages can subscribe: window.addEventListener("yyc:data-changed", ...). */
export const DATA_CHANGED_EVENT = "yyc:data-changed";
