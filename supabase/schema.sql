-- Run once in the Supabase SQL Editor. The browser never accesses these tables directly.
create table if not exists public.documents (
  id uuid primary key,
  session_hash text not null,
  name text not null,
  status text not null check (status in ('processing', 'ready', 'failed')),
  stage text not null default 'Reading PDF',
  storage_path text not null,
  pages integer not null default 0,
  chunks integer not null default 0,
  error text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists documents_session_idx on public.documents(session_hash, created_at desc);
create index if not exists documents_expiry_idx on public.documents(expires_at);
create table if not exists public.chunks (
  id uuid primary key,
  document_id uuid not null references public.documents(id) on delete cascade,
  page integer not null,
  ordinal integer not null,
  content text not null
);
create index if not exists chunks_document_idx on public.chunks(document_id, ordinal);
alter table public.documents enable row level security;
alter table public.chunks enable row level security;
revoke all on public.documents, public.chunks from anon, authenticated;
grant all on public.documents, public.chunks to service_role;
-- No public policies. The server uses its private key and checks session ownership.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('study-pdfs', 'study-pdfs', false, 10485760, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 10485760, allowed_mime_types = array['application/pdf'];
