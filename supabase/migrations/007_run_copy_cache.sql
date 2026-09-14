-- Shared Gemini pile copy (title/summary/per-row lines) so Jerry & Corey share one reality.
-- Keyed by sorted share ids within a conversation; content_fp invalidates on enrich changes.

create table if not exists public.run_copy_cache (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  share_ids_key text not null,
  content_fp text not null default '',
  title text not null,
  summary text not null default '',
  item_summaries jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  unique (conversation_id, share_ids_key)
);

create index if not exists run_copy_cache_conversation_idx
  on public.run_copy_cache (conversation_id, updated_at desc);

alter table public.run_copy_cache enable row level security;

drop policy if exists "Members read run copy" on public.run_copy_cache;
create policy "Members read run copy"
  on public.run_copy_cache for select
  to authenticated
  using (public.is_conversation_member(conversation_id));

drop policy if exists "Members insert run copy" on public.run_copy_cache;
create policy "Members insert run copy"
  on public.run_copy_cache for insert
  to authenticated
  with check (public.is_conversation_member(conversation_id));

drop policy if exists "Members update run copy" on public.run_copy_cache;
create policy "Members update run copy"
  on public.run_copy_cache for update
  to authenticated
  using (public.is_conversation_member(conversation_id))
  with check (public.is_conversation_member(conversation_id));

drop policy if exists "Members delete run copy" on public.run_copy_cache;
create policy "Members delete run copy"
  on public.run_copy_cache for delete
  to authenticated
  using (public.is_conversation_member(conversation_id));

do $$
begin
  alter publication supabase_realtime add table public.run_copy_cache;
exception
  when duplicate_object then null;
end $$;
