# YYC CRM — lightweight CRM with a Malaysian Tax Q&A (RAG) assistant

A small CRM (contacts, opportunities, activity log, dashboard) built with **Next.js (App Router) + TypeScript + Supabase**, plus a **RAG module** that answers Malaysian tax questions from public LHDN / Royal Malaysian Customs documents, with citations, and is linked to CRM contacts.

- Docs: [ARCHITECTURE.md](ARCHITECTURE.md) (diagram, data model, RAG design, evaluation, retrospective) · [AI_USAGE.md](AI_USAGE.md)
- Auth: none. A single hardcoded user ("Sales Rep") is used, as the brief allows.

## Link to access the CRM platform

https://yyc-crm-assessment.vercel.app/

## Features

| Area | What you get |
|---|---|
| Contacts (leads) | Create / view / edit / delete. Name, Email, Phone, Company, Status (Lead / Prospect / Customer). Search (name, email, company) and status filter. |
| Opportunities | Linked to a contact. Title, Value (RM), Stage (New → Contacted → Qualified → Proposal → Won / Lost). Kanban board with drag-and-drop (plus a stage dropdown fallback) and per-column RM totals. |
| Activity log | Call / Email / Meeting / Note with date and description, logged against a contact or opportunity (on the contact page). |
| Dashboard | Total contacts, open opportunities, open pipeline value (RM), won value, recent activity feed. |
| **Tax Q&A (RAG)** | Chat at `/tax-qa`; also embedded in each contact page (**"Ask a tax question about this client"**). Answers carry citations (document, page, section, link). Refuses when the answer is not in the knowledge base. **Chat history**: every conversation is saved, searchable, renameable and reopenable; follow-up questions use the previous turns. |
| **YYC Assistant (chatbot)** | Floating chat widget at the bottom-right of every page. Describe a contact or deal in plain language and it fills the form for you, asks for whatever is missing, shows a confirmation card, and saves only after you click **Confirm**. Also a **CRM Copilot**: ask questions about your CRM data in plain English and get an answer grounded in the matching records. A small router LLM decides per message whether it is automation or a question. Guarded against prompt injection and off-topic requests. |

## Prerequisites

- Node.js 20+ (developed on Node 24) and npm
- A Supabase project (Postgres with the `vector` extension)
- A Gemini API key (Google AI Studio)

## Run locally

```bash
# 1. install
npm install

# 2. configure secrets
cp .env.sample .env        # then fill in the values (see table below)

# 3. create the database schema (pick ONE)
#    a) Supabase SQL editor: run supabase/migrations/0001_init.sql, then 0002_chat_sessions.sql
#    b) Supabase MCP / CLI:  apply both migration files in order
#    (optional demo data)    run supabase/seed.sql the same way

# 4. ingest the tax documents into the vector DB (one-off, a few minutes)
npm run ingest

# 5. start the app
npm run dev                # http://localhost:3000
```

### Environment variables

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable (anon) key, used if no service key is set |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side key used by the API routes and the ingest script (**secret**, never exposed to the browser) |
| `SUPABASE_PASSWORD` | DB password (only for direct `psql` access; the app does not use it) |
| `GEMINI_API_KEY` | Gemini key for embeddings and answer generation (**secret**) |
| `GEMINI_CHAT_MODEL` / `GEMINI_CHAT_FALLBACK_MODEL` | Answer-generation model and one-shot fallback if it is overloaded |
| `GEMINI_ROUTER_MODEL` | Smaller, faster model used by the chatbot to decide automation vs. data question (default `gemini-3.1-flash-lite`) |
| `GEMINI_EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS` | `gemini-embedding-001`, 768 dims (must match the `vector(768)` column) |
| `RAG_TOP_K`, `RAG_MIN_SIMILARITY` | Retrieval size (default 6) and similarity floor (default 0.45) |

`.env` is git-ignored; `.env.sample` is the committed template.

> Gemini model availability changes over time. If you get a 404/503 from the chat model, change `GEMINI_CHAT_MODEL` in `.env`.

## The RAG module

**Knowledge base** — 9 public PDFs (e-Invoice guidelines, RMCD SST guides, LHDN public rulings), listed in [`data/sources.json`](data/sources.json). PDFs are downloaded to `data/pdfs/` (git-ignored) by the ingest script.

**Ingest** (`npm run ingest`): download → parse per page (pdf-parse) → clean (drop TOC dot-leaders, page numbers, running headers) → chunk (~3000 chars, ~15% overlap, page range + section tracked) → embed (Gemini `gemini-embedding-001`, 768-d) → store in `tax_documents` / `tax_chunks` (pgvector, HNSW). It is idempotent: re-running replaces a document's chunks.

```bash
npm run ingest -- --dry-run              # parse + chunk stats only, no API/DB calls
npm run ingest -- --only "e-Invoice"     # one document (name substring)
```

**Ask** — from the UI (`/tax-qa` or a contact page) or via the API:

```bash
curl -X POST http://localhost:3000/api/rag/ask -H "content-type: application/json" \
  -d '{"question":"By when must SST-02 be furnished?", "contact_id":"<optional CRM contact uuid>"}'
```

Other endpoints: `GET /api/rag/documents`, `GET /api/rag/history?contact_id=`, and the chat-history API: `GET /api/rag/sessions?q=&contact_id=` (list / search), `GET|PATCH|DELETE /api/rag/sessions/:id`. Pass `session_id` to `/api/rag/ask` to continue a conversation.

**Evaluation** — 10 in-scope + 2 out-of-scope questions in [`data/eval-questions.json`](data/eval-questions.json):

```bash
npm run eval                  # retrieval + answers; writes data/eval-results.{json,md}
npm run eval -- --no-answer   # retrieval metrics only (no LLM calls)
```

Results and lessons are in [ARCHITECTURE.md](ARCHITECTURE.md#8-evaluation-results).

### Optional / bonus features and how to trigger them

- **Hybrid retrieval** (vector + keyword, Reciprocal Rank Fusion) — always on; implemented in the SQL function `match_tax_chunks`.
- **Metadata filter** — choose a category (e-Invoice / SST / Public Ruling) in the Tax Assistant dropdown, or send `"category"` in the API body.
- **CRM link** — open a contact → *Ask a tax question about this client*, or pick a client in `/tax-qa`. The client's company, status and open deals are added to the prompt (for tailoring only, never cited) and the Q&A is saved to `rag_queries` against that contact.
- **Chat history** — open `/tax-qa`: the left panel lists past chats grouped by date (Today / Yesterday / Previous 7 days / Older). Type in its search box to search titles and message text, click a chat to reopen and continue it, or rename/delete it. On a contact page, use the *Chat* dropdown to continue that client's chats.
- **YYC Assistant chatbot** — click the round button at the bottom-right of any page. Try: *"Add a new contact"* (it will guide you), *"Add Siti Aminah from Kopi Timur Sdn Bhd, siti@kopitimur.my, she's a prospect"*, or *"Create an opportunity 'POS rollout' worth RM 50k for Daniel Lim"*. Review the confirmation card, then **Confirm** to save.
- **CRM Copilot** — same chatbot, just ask a question: *"Which prospects haven't been contacted in 2 weeks?"*, *"Summarise all opportunities above RM 10,000 in the Proposal stage"*, *"How many contacts do I have by status?"*, *"What's the total value of open opportunities?"*, *"Show Sarah Wong's activities"*. The badge on each reply shows which route was taken (Copilot or Automation). The Copilot is read-only; tax questions are redirected to the Tax Assistant. Details of the safeguards: [ARCHITECTURE.md §4](ARCHITECTURE.md#4-yyc-assistant-chatbot-router-form-filling-automation-and-crm-copilot).
- **Model fallback** — set `GEMINI_CHAT_FALLBACK_MODEL`; used automatically after retries on 429/503.

## Project structure (MVC)

```
src/
  app/                 View: pages (dashboard, contacts, opportunities, tax-qa) + thin API route handlers (app/api/**)
  components/          View: UI components (Kanban, TaxChat, ChatHistory, chatbot/, forms, ...)
  controllers/         Controller: validation (zod) + business logic
  models/              Model: all Supabase data access
  services/rag/        AI integration: parser, chunker, embedder, ingest, retriever, prompts, answerer
  services/assistant/  YYC Assistant chatbot: guard (injection defences), router, prompts, schema, extractor, orchestration
  services/assistant/copilot/  CRM Copilot: planner, read-only executor, answerer
  lib/                 env, Supabase/Gemini clients, HTTP helpers, typed fetch client
  types/               Shared types / enums
scripts/               ingest.ts, eval.ts
data/                  sources.json, eval questions + results
supabase/              migrations + seed
```

## Scripts

`npm run dev` · `npm run build` · `npm run start` · `npm run lint` · `npm run ingest` · `npm run eval`
