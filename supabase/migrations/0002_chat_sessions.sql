-- Tax Assistant conversations: group rag_queries into searchable chat sessions.
create table public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'New chat',
  contact_id uuid references public.contacts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index chat_sessions_updated_idx on public.chat_sessions (updated_at desc);
create index chat_sessions_contact_idx on public.chat_sessions (contact_id);

alter table public.rag_queries add column session_id uuid references public.chat_sessions(id) on delete cascade;
create index rag_queries_session_idx on public.rag_queries (session_id, created_at);

-- Backfill: every existing standalone query becomes its own session.
with moved as (
  insert into public.chat_sessions (title, contact_id, created_at, updated_at)
  select left(question, 60), contact_id, created_at, created_at from public.rag_queries where session_id is null
  returning id, created_at, contact_id, title
)
update public.rag_queries q set session_id = m.id
from moved m where q.session_id is null and q.created_at = m.created_at and q.contact_id is not distinct from m.contact_id;

alter table public.chat_sessions enable row level security;
create policy "open access (no auth in assessment)" on public.chat_sessions for all to anon, authenticated using (true) with check (true);
