# AI usage

## Tools

| Tool | Used for |
|---|---|
| **Claude Code** (Anthropic CLI / VS Code extension) | Planning the architecture, writing the application code, running and debugging it, and drafting these documents. |
| **Claude Code sub-agents** | Three agents worked in parallel on separate file sets: (1) CRM backend — models, controllers, API routes; (2) RAG module — parsing, chunking, embeddings, retrieval, prompts, answerer, ingestion and evaluation scripts; (3) frontend — pages, Kanban, chat UI. |
| **Supabase MCP server** | Inspecting the empty project, applying the schema migration (tables, pgvector, HNSW/GIN indexes, `match_tax_chunks` RPC, RLS) and seeding demo data. |
| **Gemini API** (runtime, not a dev tool) | `gemini-embedding-001` for embeddings and a Gemini chat model for answer generation inside the product. |

## What the AI did

- Designed the schema, API contract and MVC layout, then split the work between agents against a shared types file.
- Wrote the code, the ingestion pipeline, the evaluation set (questions derived from the downloaded PDFs' text) and the docs.
- Found and downloaded the public documents and verified they were text-extractable.
- Ran live: ingestion into Supabase, the retrieval/answer evaluation, API smoke tests, `tsc`, `eslint` and `next build`.

## What I (the human) did and verified

- Provided the requirements, credentials, and Supabase MCP access; made the decisions on stack and scope.
- The numbers in ARCHITECTURE.md come from a real `npm run eval` run, not from the AI's estimate.

## Issues the AI introduced or hit, and how they were caught

| Issue | How it was caught |
|---|---|
| `@apply btn` inside Tailwind v4 CSS broke every page (500) | Smoke-testing the running app; fixed in `globals.css` |
| Route segment config (`runtime`, `maxDuration`) is incompatible with `cacheComponents` | Live request to `/api/rag/ask`; removed |
| `params` / `usePathname()` outside `<Suspense>` failed only in `next build`, not in dev | Production build; wrapped in Suspense |
| The LLM emitted citation markers like `[26]` that match no retrieved passage | Manual inspection of a live answer; markers are now stripped in code |
| `gemini-2.5-flash` returned 404 for the supplied key | Live ingest/eval run; model made configurable with a fallback |

## Notes on use

- Secrets live only in the git-ignored `.env`; they were not pasted into code or docs.
- AI-generated code was type-checked, linted and exercised against the real database and Gemini API rather than mocked.
