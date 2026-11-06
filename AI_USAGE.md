# AI usage

## Tools

| Tool | Used for |
|---|---|
| **Claude Code** (Anthropic CLI / VS Code extension) | Planning the architecture, writing the application code, running and debugging it, and drafting these documents. |
| **Claude Code sub-agents** | Three agents worked in parallel on separate file sets: (1) CRM backend — models, controllers, API routes; (2) RAG module — parsing, chunking, embeddings, retrieval, prompts, answerer, ingestion and evaluation scripts; (3) frontend — pages, Kanban, chat UI. |
| **Claude Code sub-agents (round 2)** | Two more agents on separate file sets: (4) Tax Assistant chat history — sessions, search, follow-up context, history sidebar; (5) the floating YYC Assistant chatbot — guard, extractor, confirm-before-save flow, widget UI. |
| **Claude Code sub-agents (round 3)** | (6) CRM Copilot and the small-model router: router, planner, read-only executor, answerer, widget changes, live tests. |
| **Supabase MCP server** | Inspecting the empty project, applying the schema migrations (tables, pgvector, HNSW/GIN indexes, `match_tax_chunks` RPC, RLS, `chat_sessions`) and seeding demo data. |
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
| Chat-history agent reported success without running the app, so the search/rename/delete paths were unverified | I exercised them live (ask, follow-up, search, rename, delete, 404 after delete) |
| Chatbot agent mirrored the contact/opportunity zod schemas instead of importing them (duplication risk) | Kept deliberately: `/commit` still re-validates through the real controllers; noted as a refactor candidate |
| Router (small model) first labelled "write a poem", "Add Sarah Tan…" and "hmm" as injection attempts with confidence 1 | Live router tests; fixed with few-shot examples and a "rare" rule |
| Copilot reported open pipeline RM 56,000 while the dashboard had shown RM 269,000 | I compared against SQL: three opportunities had `value_rm = 0`. Root cause was `createSchema.partial()` keeping `.default(0)` so Kanban drags reset values (a backend-agent bug). Fixed; values restored; verified by calling the controllers directly |
| The running dev server (:3000) kept serving pre-fix code after the edit, so an HTTP re-test falsely looked unfixed | Re-tested the controllers directly with `tsx`; noted that the dev server needs a restart |
| Chatbot UI animation, focus handling and mobile layout were never viewed in a browser by the AI | Not verified visually; listed as a gap in ARCHITECTURE.md §9 |

## Notes on use

- Secrets live only in the git-ignored `.env`; they were not pasted into code or docs.
- AI-generated code was type-checked, linted and exercised against the real database and Gemini API rather than mocked.

### One Real Example
- The prompt given to the AI
You are asked to design, architect, and build a lightweight CRM system with a meaningful AI
integration component. Below are the higlighted requirements and things to be followed/done:

Part 1 — Core CRM Modules:
Leads: Create, view, edit, and delete leads. Fields: Name, Email, Phone, Company, and Status (Lead /
Prospect / Customer). Include search and filter by status.
Opportunities: Associate opportunity with contacts. Fields: Title, Value (RM), and Stage (New →
Contacted → Qualified → Proposal → Won / Lost). Display opportunities in a Kanban board or list
view grouped by stage.
Dashboard: Total contacts, open opportunities, total opportunities value (RM), and a recent
activity feed.
Activity Log: Log activities against a contact or
opportunity. Fields: Type (Call / Email / Meeting / Note), Date, Description. If you are short on time,
skip this and spend the effort on the RAG module.
Part 2 — Mandatory AI Integration (RAG):
You must implement the RAG module using a LLM API (gemini API which i will provide later) and a real embedding model. No mocked responses - the prompts,
embedding calls and LLM calls must be visible inside the code.

Mandatory - Tax Document Q&A (RAG): Build a Q&A feature over Malaysian tax documents. (1)
Knowledge base: ingest at least 5 publicly available documents (e.g. LHDN public rulings, SST
guides, e-invoicing guidelines; PDF or HTML). (2) Pipeline: parse, chunk, embed and store the
chunks in a vector database. Preferred: Supabase/PostgreSQL with pgvector; other vector stores
are acceptable if justified. (3) Retrieval: top-k similarity search, with a metadata filter or a
reranking step as a bonus. (4) Answering: pass the retrieved chunks to the LLM and return an
answer with citations (document name and page/section). If the answer is not in the retrieved
context, the system must say so rather than guess. (5) Evaluation: write 8-10 test questions with
the expected source document, run them, and report your retrieval hit rate and what you learned.
(6) Simple UI: a chat or search box in the web app. You need to link it to the CRM (e.g. a sales rep asking tax questions about a client)

Above are the things that you need to achieve as part of the goals and objectives, kindly take note on those features and ensure they are achieve. Once the coding part is completed, you may need to prepare the things mentioned below too

Part 3 — Architecture & Engineering Brief:
System Design: Design the system. Produce a component diagram showing how the frontend, backend API, database, and LLM service connect. Create a dummy one first then i will redraw it my own in draw.io
Data Model: Design the key tables or entities and their relationships. Include this in the
ARCHITECTURE.md.
AI Integration Design: Document the RAG design: document parsing, chunking strategy and size,
embedding model, vector store and index, retrieval settings (top-k, filters, reranking), prompt
design, citation approach, hallucination guard, and error handling.
Stack Choice: kindly use TypeScript with Next.js and Supabase throughout the entire develpoment (supabase MCP and connection will provide later below).
Authentication is not required - a single hardcoded user is sufficient.

At the end of the deliverables, produces few more extra things shown below:
1. README.md: Step-by-step instructions to run the project locally, including how to ingest the documents. Describe the RAG module and any optional feature, and how to trigger them.
2. ARCHITECTURE.md: System component diagram, data model, RAG and AI integration design, your
evaluation results, and a candid "What I would do differently with more time" section.
3. AI_USAGE.md: Document which AI tools (claude code this case) used and what for.

Below is the given required credentials to complete this assessments (kindly create an .env and .env.sample for all of the sensitive information):
NEXT_PUBLIC_SUPABASE_URL=https://fezvcbgpbjpeinokgxxd.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_J6Ts7AgktKHsDVq6jEZlnQ_HsbOkYu7
SUPABASE_PASSWORD=DUMMY_NOW
GEMINI_API_KEY=DUMMY_NOW

throughout the development, if you are unsure anything or decision making, you can throw me a question or decision making session and i will answer you. Also, for the backend, kindly use MVC architecture for this as it is easy to develop 1 shot for both frontend and backend. Also, you may assign multiple agents to work on different parts such as 1 agent on frontend, 1 agent on backend API, 1 agent on the AI integration part, and so on. Also, I setup the MCP for the supabase so you can kindly use/execute anything inside the supabase.

- The output I received
AI at first forgot to create the .env file due to large context so I in the middle of agents processing, I asked the AI to create a .env and .env.sample and paste the necessary API key so that the AI can continue to perform changes/edits on the code rather than doing a dummy/mock one first. Other than that, there is a missing chat history on the tax assistant too so I asked the AI to create the chat history for it too as it is common to have a chat history nowadays for AI tools. The short of AI right now is only about context as different AI will have different maximum amount of context, and also the UX feature (about the chat history) as this requires experience and human sense of needs to create it.