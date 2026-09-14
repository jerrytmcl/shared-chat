-- Message reactions (one emoji per user per message; tap same removes, different replaces)
-- Run in Supabase SQL Editor after 001–004.

create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  unique (message_id, user_id)
);

create index if not exists message_reactions_conversation_idx
  on public.message_reactions (conversation_id);

create index if not exists message_reactions_message_idx
  on public.message_reactions (message_id);

alter table public.message_reactions enable row level security;

-- Members can read reactions in conversations they belong to
drop policy if exists "Members read reactions" on public.message_reactions;
create policy "Members read reactions"
  on public.message_reactions for select
  to authenticated
  using (public.is_conversation_member(conversation_id));

-- Insert own rows only, must be a member
drop policy if exists "Members insert own reactions" on public.message_reactions;
create policy "Members insert own reactions"
  on public.message_reactions for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and public.is_conversation_member(conversation_id)
  );

-- Update own rows only (replace emoji), must remain member
drop policy if exists "Members update own reactions" on public.message_reactions;
create policy "Members update own reactions"
  on public.message_reactions for update
  to authenticated
  using (
    user_id = auth.uid()
    and public.is_conversation_member(conversation_id)
  )
  with check (
    user_id = auth.uid()
    and public.is_conversation_member(conversation_id)
  );

-- Delete own rows only
drop policy if exists "Members delete own reactions" on public.message_reactions;
create policy "Members delete own reactions"
  on public.message_reactions for delete
  to authenticated
  using (
    user_id = auth.uid()
    and public.is_conversation_member(conversation_id)
  );

-- Realtime publication (safe if already added)
do $$
begin
  alter publication supabase_realtime add table public.message_reactions;
exception
  when duplicate_object then null;
end $$;
