// Shared contract between models, controllers, API routes, RAG services and UI.

export const CONTACT_STATUSES = ["Lead", "Prospect", "Customer"] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export const OPPORTUNITY_STAGES = ["New", "Contacted", "Qualified", "Proposal", "Won", "Lost"] as const;
export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

export const ACTIVITY_TYPES = ["Call", "Email", "Meeting", "Note"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export interface Contact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  status: ContactStatus;
  created_at: string;
  updated_at: string;
}

export interface Opportunity {
  id: string;
  contact_id: string;
  title: string;
  value_rm: number;
  stage: OpportunityStage;
  created_at: string;
  updated_at: string;
  contact?: Pick<Contact, "id" | "name" | "company"> | null; // joined on list
}

export interface Activity {
  id: string;
  contact_id: string | null;
  opportunity_id: string | null;
  type: ActivityType;
  activity_date: string;
  description: string;
  created_at: string;
  contact?: Pick<Contact, "id" | "name"> | null;
  opportunity?: Pick<Opportunity, "id" | "title"> | null;
}

export interface DashboardStats {
  total_contacts: number;
  open_opportunities: number; // stage not in (Won, Lost)
  open_opportunities_value_rm: number; // sum of value_rm for open opportunities
  won_value_rm: number;
  recent_activities: Activity[]; // latest 10, newest first
}

// ---------- RAG ----------
export interface Citation {
  n: number; // [n] marker used in the answer text
  document_id: string;
  document_name: string;
  source_url: string;
  page_start: number | null;
  page_end: number | null;
  section: string | null;
  excerpt: string;
}

export interface RagAnswer {
  answer: string;
  answerable: boolean; // false => the context did not contain the answer
  citations: Citation[];
  retrieved: { chunk_id: string; document_name: string; page_start: number | null; similarity: number; rrf_score: number }[];
  query_id?: string;
  session_id?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  contact_id: string | null;
  contact_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatSessionSummary extends ChatSession {
  message_count: number;
  last_question: string | null;
  match_snippet: string | null; // set when a search matched message text rather than the title
}

export interface ChatMessageRecord {
  id: string;
  question: string;
  answer: string;
  answerable: boolean;
  citations: Citation[];
  created_at: string;
}

export interface ChatSessionDetail extends ChatSession {
  messages: ChatMessageRecord[];
}

export interface RagAskRequest {
  session_id?: string; // continue an existing chat; omitted => a new session is created
  question: string;
  contact_id?: string; // links the question to a CRM contact and adds client context to the prompt
  category?: string; // optional metadata filter
}

export interface TaxDocument {
  id: string;
  name: string;
  category: string;
  source_url: string;
  page_count: number | null;
  chunk_count: number;
}

// API envelope: success => { data }, failure => { error }
export type ApiResponse<T> = { data: T } | { error: string };
