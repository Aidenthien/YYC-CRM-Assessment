-- YYC CRM: core CRM tables + RAG knowledge base (pgvector)
create extension if not exists vector with schema extensions;

-- ---------- CRM ----------
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  company text,
  status text not null default 'Lead' check (status in ('Lead','Prospect','Customer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index contacts_status_idx on public.contacts (status);

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  title text not null,
  value_rm numeric(14,2) not null default 0 check (value_rm >= 0),
  stage text not null default 'New' check (stage in ('New','Contacted','Qualified','Proposal','Won','Lost')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index opportunities_contact_idx on public.opportunities (contact_id);
create index opportunities_stage_idx on public.opportunities (stage);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete cascade,
  type text not null check (type in ('Call','Email','Meeting','Note')),
  activity_date timestamptz not null default now(),
  description text not null default '',
  created_at timestamptz not null default now(),
  constraint activities_has_target check (contact_id is not null or opportunity_id is not null)
);
create index activities_contact_idx on public.activities (contact_id);
create index activities_opportunity_idx on public.activities (opportunity_id);
create index activities_date_idx on public.activities (activity_date desc);

-- ---------- RAG knowledge base ----------
create table public.tax_documents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,            -- e.g. SST, e-Invoice, Income Tax, Public Ruling
  source_url text not null unique,
  page_count int,
  chunk_count int not null default 0,
  ingested_at timestamptz not null default now()
);

create table public.tax_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.tax_documents(id) on delete cascade,
  chunk_index int not null,
  page_start int,
  page_end int,
  section text,
  content text not null,
  embedding extensions.vector(768) not null,
  fts tsvector generated always as (to_tsvector('english', content)) stored,
  unique (document_id, chunk_index)
);
create index tax_chunks_embedding_idx on public.tax_chunks using hnsw (embedding extensions.vector_cosine_ops);
create index tax_chunks_fts_idx on public.tax_chunks using gin (fts);
create index tax_chunks_document_idx on public.tax_chunks (document_id);

-- Q&A history, optionally tied to a CRM contact
create table public.rag_queries (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts(id) on delete set null,
  question text not null,
  answer text not null,
  citations jsonb not null default '[]'::jsonb,
  answerable boolean not null default true,
  created_at timestamptz not null default now()
);
create index rag_queries_contact_idx on public.rag_queries (contact_id, created_at desc);

-- Hybrid retrieval: vector (cosine) + keyword (FTS), fused with Reciprocal Rank Fusion.
create or replace function public.match_tax_chunks(
  query_text text,
  query_embedding extensions.vector(768),
  match_count int default 8,
  filter_category text default null,
  rrf_k int default 60
)
returns table (
  id uuid, document_id uuid, document_name text, category text, source_url text,
  page_start int, page_end int, section text, content text,
  similarity float, rrf_score float
)
language sql stable
set search_path = public, extensions
as $$
  with candidates as (
    select c.id, c.embedding <=> query_embedding as dist
    from tax_chunks c join tax_documents d on d.id = c.document_id
    where filter_category is null or d.category = filter_category
    order by c.embedding <=> query_embedding
    limit match_count * 4
  ),
  vec as (select id, row_number() over (order by dist) as rnk, dist from candidates),
  kw as (
    select c.id, row_number() over (order by ts_rank_cd(c.fts, websearch_to_tsquery('english', query_text)) desc) as rnk
    from tax_chunks c join tax_documents d on d.id = c.document_id
    where c.fts @@ websearch_to_tsquery('english', query_text)
      and (filter_category is null or d.category = filter_category)
    order by ts_rank_cd(c.fts, websearch_to_tsquery('english', query_text)) desc
    limit match_count * 4
  ),
  fused as (
    select coalesce(v.id, k.id) as id,
           coalesce(1.0 / (rrf_k + v.rnk), 0) + coalesce(1.0 / (rrf_k + k.rnk), 0) as score,
           v.dist
    from vec v full outer join kw k on k.id = v.id
  )
  select c.id, c.document_id, d.name, d.category, d.source_url,
         c.page_start, c.page_end, c.section, c.content,
         (1 - coalesce(f.dist, (c.embedding <=> query_embedding)))::float as similarity,
         f.score::float as rrf_score
  from fused f
  join tax_chunks c on c.id = f.id
  join tax_documents d on d.id = c.document_id
  order by f.score desc
  limit match_count;
$$;

-- ---------- RLS ----------
-- No auth in this assessment (single hardcoded user). RLS is enabled so the intent is explicit,
-- with open policies for the anon role. In production: add Supabase Auth and scope per user.
do $$
declare t text;
begin
  foreach t in array array['contacts','opportunities','activities','tax_documents','tax_chunks','rag_queries'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "open access (no auth in assessment)" on public.%I for all to anon, authenticated using (true) with check (true)', t);
  end loop;
end $$;
