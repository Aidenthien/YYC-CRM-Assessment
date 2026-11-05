import "dotenv/config";
import { ingestDocument, loadSources, type IngestStats } from "../src/services/rag/ingest";

// Usage: npm run ingest [-- --dry-run] [-- --only "substring of name"]
async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const onlyIdx = process.argv.indexOf("--only");
  const only = onlyIdx > -1 ? process.argv[onlyIdx + 1].toLowerCase() : null;
  const sources = (await loadSources()).filter((s) => !only || s.name.toLowerCase().includes(only));
  const all: IngestStats[] = [];
  for (const s of sources) {
    console.log(`\n== ${s.name} [${s.category}]`);
    try {
      const st = await ingestDocument(s, { dryRun });
      all.push(st);
      console.log(`  pages=${st.pages} chars=${st.chars} chunks=${st.chunks} avg=${st.avgChunk} max=${st.maxChunk}`);
      if (dryRun && st.sample) console.log(`  sample #${st.sample.chunk_index} p${st.sample.page_start}-${st.sample.page_end} section=${JSON.stringify(st.sample.section)}\n  ${st.sample.content.slice(0, 250).replace(/\n/g, " / ")}...`);
    } catch (e) {
      console.error(`  FAILED: ${e instanceof Error ? e.message : e}`);
      process.exitCode = 1;
    }
  }
  console.table(all.map((r) => ({ ...r, sample: undefined })));
  console.log(`total chunks: ${all.reduce((n, s) => n + s.chunks, 0)}${dryRun ? " (dry run: no embeddings, no DB writes)" : ""}`);
}
main();
