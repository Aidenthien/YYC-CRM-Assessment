import type { Turn } from "../guard";
import { planQuery } from "./planner";
import { execute } from "./executor";
import { writeAnswer } from "./answerer";
import { describePlan } from "./schema";

export interface CopilotRecord { type: "contact" | "opportunity" | "activity"; id: string; label: string; link: string }
export interface CopilotResult {
  answer: string;
  records: CopilotRecord[];
  plan: { entity: string; summary: string; aggregate: string; total_matched: number } | null;
  truncated: boolean;
  supported: boolean;
}

export const COPILOT_EXAMPLES = [
  "Which prospects haven't been contacted in 2 weeks?",
  "Summarise opportunities above RM 10,000 in Proposal",
  "How much is in the pipeline by stage?",
];
const UNSUPPORTED = `I can answer questions about your contacts, opportunities and activities (counts, totals, lists, who hasn't been contacted). Try: "${COPILOT_EXAMPLES.join('" or "')}".`;

/** Read-only copilot: plan (LLM) -> execute (code) -> answer (LLM). Copilot never writes. */
export async function runCopilot(turns: Turn[]): Promise<CopilotResult> {
  const question = [...turns].reverse().find((t) => t.role === "user")?.content ?? "";
  const planned = await planQuery(turns);
  if (!planned.ok) {
    return { answer: `${planned.reason ? `${planned.reason} ` : ""}${UNSUPPORTED}`.trim(), records: [], plan: null, truncated: false, supported: false };
  }
  const { plan } = planned;
  const summary = describePlan(plan);
  const exec = await execute(plan);
  const meta = { entity: plan.entity, summary, aggregate: plan.aggregate, total_matched: exec.totalMatched };

  if (exec.totalMatched === 0) {
    // Deterministic: no LLM call when there is nothing to describe.
    return { answer: `No records match your question (${summary}).`, records: [], plan: meta, truncated: false, supported: true };
  }
  const answer = await writeAnswer(question, summary, exec);
  return {
    answer,
    records: exec.records.map((r) => ({ type: r.type, id: r.id, label: r.label, link: r.link })),
    plan: meta,
    truncated: exec.truncated,
    supported: true,
  };
}
