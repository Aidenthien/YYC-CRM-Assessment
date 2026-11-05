import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { retrieve } from "../src/services/rag/retriever";
import { answer } from "../src/services/rag/answerer";
import { env } from "../src/lib/env";

interface Q {
  id: string; question: string; expected_source: string | null; expected_page: number | null; expected_answer_contains: string | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pageHit = (c: { page_start: number | null; page_end: number | null }, p: number | null) =>
  p != null && c.page_start != null && p >= c.page_start && p <= (c.page_end ?? c.page_start);

// Usage: npm run eval [-- --no-answer]  (retrieval metrics only)
async function main() {
  const skipAnswer = process.argv.includes("--no-answer");
  const dir = path.join(process.cwd(), "data");
  const qs: Q[] = JSON.parse(await fs.readFile(path.join(dir, "eval-questions.json"), "utf8"));
  const k = env.topK;
  const rows = [];

  for (const q of qs) {
    const chunks = await retrieve(q.question, { topK: k });
    const inScope = q.expected_source !== null;
    const docRank = inScope ? chunks.findIndex((c) => c.document_name === q.expected_source) + 1 : 0;
    const pageRank = inScope && q.expected_page != null
      ? chunks.findIndex((c) => c.document_name === q.expected_source && pageHit(c, q.expected_page)) + 1 : 0;
    let answerable: boolean | null = null, text = "", contains: boolean | null = null, citedExpected: boolean | null = null;
    if (!skipAnswer) {
      const a = await answer(q.question, chunks);
      answerable = a.answerable; text = a.answer;
      if (inScope) {
        contains = q.expected_answer_contains ? a.answer.toLowerCase().includes(q.expected_answer_contains.toLowerCase()) : null;
        citedExpected = a.citations.some((c) => c.document_name === q.expected_source);
      }
      await sleep(1500);
    }
    rows.push({
      id: q.id, in_scope: inScope, question: q.question, expected_source: q.expected_source, expected_page: q.expected_page,
      retrieved_n: chunks.length, doc_rank: docRank || null, page_rank: pageRank || null,
      top_similarity: chunks[0] ? Number(chunks[0].similarity.toFixed(3)) : null,
      top_docs: chunks.slice(0, 3).map((c) => `${c.document_name} p${c.page_start}`),
      answerable, answer: text, answer_contains_expected: contains, cited_expected_source: citedExpected,
      correct_refusal: !inScope && !skipAnswer ? answerable === false : null,
    });
  }

  const ins = rows.filter((r) => r.in_scope), oos = rows.filter((r) => !r.in_scope);
  const hitK = ins.filter((r) => r.doc_rank).length;
  const hit1 = ins.filter((r) => r.doc_rank === 1).length;
  const pageHits = ins.filter((r) => r.page_rank).length;
  const mrr = ins.reduce((s, r) => s + (r.doc_rank ? 1 / r.doc_rank : 0), 0) / Math.max(1, ins.length);
  const summary = {
    run_at: new Date().toISOString(), top_k: k, min_similarity: env.minSimilarity, chat_model: env.chatModel, embedding_model: env.embeddingModel,
    in_scope_questions: ins.length, doc_hit_at_k: hitK, doc_hit_rate: hitK / Math.max(1, ins.length), doc_hit_at_1: hit1,
    page_hit_at_k: pageHits, mrr: Number(mrr.toFixed(3)),
    answers_contain_expected: skipAnswer ? null : ins.filter((r) => r.answer_contains_expected).length,
    answered_in_scope: skipAnswer ? null : ins.filter((r) => r.answerable).length,
    out_of_scope_questions: oos.length, correct_refusals: skipAnswer ? null : oos.filter((r) => r.correct_refusal).length,
  };

  console.table(rows.map((r) => ({ id: r.id, doc_rank: r.doc_rank, page_rank: r.page_rank, n: r.retrieved_n, sim: r.top_similarity, answerable: r.answerable, has_expected: r.answer_contains_expected, refused_ok: r.correct_refusal })));
  console.log(summary);
  await fs.writeFile(path.join(dir, "eval-results.json"), JSON.stringify({ summary, rows }, null, 2));

  const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(0)}%` : "n/a");
  const md = [
    "# RAG evaluation results", "",
    `Run: ${summary.run_at} | top-k ${k} | min similarity ${env.minSimilarity} | chat \`${env.chatModel}\` | embeddings \`${env.embeddingModel}\``, "",
    "## Summary", "",
    `- Retrieval hit@${k} (expected document in top-${k}): **${hitK}/${ins.length} (${pct(hitK, ins.length)})**`,
    `- Hit@1: ${hit1}/${ins.length} | exact-page hit@${k}: ${pageHits}/${ins.length} | MRR: ${summary.mrr}`,
    ...(skipAnswer ? [] : [
      `- Answers containing expected fact: ${summary.answers_contain_expected}/${ins.length}; answered (not refused): ${summary.answered_in_scope}/${ins.length}`,
      `- Out-of-scope correctly refused: **${summary.correct_refusals}/${oos.length}**`]),
    "", "## Per question", "",
    "| id | doc rank | page rank | top sim | answerable | has expected fact | question |", "|---|---|---|---|---|---|---|",
    ...rows.map((r) => `| ${r.id} | ${r.doc_rank ?? (r.in_scope ? "miss" : "-")} | ${r.page_rank ?? (r.in_scope ? "miss" : "-")} | ${r.top_similarity ?? "-"} | ${r.answerable ?? "-"} | ${r.in_scope ? (r.answer_contains_expected ?? "-") : `refused: ${r.correct_refusal ?? "-"}`} | ${r.question} |`),
    "",
  ].join("\n");
  await fs.writeFile(path.join(dir, "eval-results.md"), md);
}
main().catch((e) => { console.error(e); process.exit(1); });
