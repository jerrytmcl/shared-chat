-- Profiles: allow self-insert if signup trigger missed
drop policy if exists "Users insert own profile" on public.profiles;
create policy "Users insert own profile"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

-- Build notes: Note for next build → lands here (no GitHub drag/drop)
create table if not exists public.build_notes (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete set null,
  author_id uuid references auth.users(id) on delete set null,
  author_label text not null default 'unspecified',
  thoughts text not null,
  app_version text,
  screenshot_path text,
  recent_chat jsonb not null default '[]'::jsonb,
  console_errors jsonb not null default '[]'::jsonb,
  network_failures jsonb not null default '[]'::jsonb,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists build_notes_created_idx
  on public.build_notes (created_at desc);

alter table public.build_notes enable row level security;

drop policy if exists "Members read build notes" on public.build_notes;
create policy "Members read build notes"
  on public.build_notes for select
  to authenticated
  using (
    conversation_id is null
    or public.is_conversation_member(conversation_id)
    or author_id = auth.uid()
  );

drop policy if exists "Members insert build notes" on public.build_notes;
create policy "Members insert build notes"
  on public.build_notes for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and (
      conversation_id is null
      or public.is_conversation_member(conversation_id)
    )
  );

-- Storage: allow uploads under build-notes/ prefix in chat-media (same bucket)
-- Existing chat-media policies already allow authenticated insert/select on the bucket.
