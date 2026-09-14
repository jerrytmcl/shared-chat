-- Shared Chat Phase 1 — initial schema
-- Two users, one conversation. Originals ≠ living packages.
-- Run in Supabase SQL Editor (or via supabase db push).

-- Extensions
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Profiles (extends auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Conversations (Phase 1: exactly one seeded conversation)
-- ---------------------------------------------------------------------------
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Shared Chat',
  created_at timestamptz not null default now()
);

-- Hardcoded shared conversation for Jerry + Corey
insert into public.conversations (id, title)
values ('00000000-0000-4000-8000-000000000001', 'Jerry & Corey')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Conversation members (exactly two users in Phase 1)
-- ---------------------------------------------------------------------------
create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'owner')),
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Original shares (durable ground truth)
-- kind: link | image | document | gif
-- ---------------------------------------------------------------------------
create table if not exists public.original_shares (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('link', 'image', 'document', 'gif')),
  title text,
  description text,
  href text,                  -- for links
  storage_path text,          -- for uploaded files in Storage
  mime_type text,
  file_size bigint,
  platform text,              -- e.g. 'X' for twitter/x links
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists original_shares_conversation_idx
  on public.original_shares (conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- Living packages (cheap disposable compositions referencing share ids)
-- provenance jsonb: what informed creation, model(s), prompts, params,
-- candidates vs chosen, timestamps
-- ---------------------------------------------------------------------------
create table if not exists public.living_packages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  title text,
  summary text,
  -- Array of original_shares.id this package composes
  share_ids uuid[] not null default '{}',
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists living_packages_conversation_idx
  on public.living_packages (conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- Messages
-- kind: text | attachment | chip | package
-- - text: ordinary chat text
-- - attachment: references one original_share (attachment-only → material run)
-- - chip: suggestion chip in timeline (Phase 3 UX; schema ready)
-- - package: materialized living package inline (Phase 3 UX; schema ready)
-- Human "runs" are UI grouping only — NOT a DB entity.
-- ---------------------------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'text'
    check (kind in ('text', 'attachment', 'chip', 'package')),
  body text not null default '',
  -- For kind=attachment: the original share
  share_id uuid references public.original_shares(id) on delete set null,
  -- For kind=package: the living package
  package_id uuid references public.living_packages(id) on delete set null,
  -- For kind=chip: optional payload (suggestion metadata); ignored in Phase 1 UI
  chip_payload jsonb,
  -- Optional: search-share style source refs (local demo / future)
  source_ids uuid[] default null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists messages_conversation_idx
  on public.messages (conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- Auto-create profile on signup
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, email, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update set
    email = excluded.email,
    display_name = coalesce(public.profiles.display_name, excluded.display_name),
    avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url),
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Helper: is the current user a member of this conversation?
-- ---------------------------------------------------------------------------
create or replace function public.is_conversation_member(conv_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = conv_id and user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.original_shares enable row level security;
alter table public.living_packages enable row level security;
alter table public.messages enable row level security;

-- Profiles: members can read each other's profiles; users update own
create policy "Profiles readable by authenticated"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Users update own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Conversations: members only
create policy "Members read conversations"
  on public.conversations for select
  to authenticated
  using (public.is_conversation_member(id));

-- Members: see membership of conversations you belong to; insert self (join flow)
create policy "Members read membership"
  on public.conversation_members for select
  to authenticated
  using (public.is_conversation_member(conversation_id) or user_id = auth.uid());

create policy "User can join conversation"
  on public.conversation_members for insert
  to authenticated
  with check (user_id = auth.uid());

-- Original shares
create policy "Members read shares"
  on public.original_shares for select
  to authenticated
  using (public.is_conversation_member(conversation_id));

create policy "Members insert shares"
  on public.original_shares for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and public.is_conversation_member(conversation_id)
  );

-- Living packages
create policy "Members read packages"
  on public.living_packages for select
  to authenticated
  using (public.is_conversation_member(conversation_id));

create policy "Members insert packages"
  on public.living_packages for insert
  to authenticated
  with check (public.is_conversation_member(conversation_id));

create policy "Members update packages"
  on public.living_packages for update
  to authenticated
  using (public.is_conversation_member(conversation_id));

-- Messages
create policy "Members read messages"
  on public.messages for select
  to authenticated
  using (public.is_conversation_member(conversation_id));

create policy "Members insert messages"
  on public.messages for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and public.is_conversation_member(conversation_id)
  );

-- ---------------------------------------------------------------------------
-- Realtime publication
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.original_shares;

-- ---------------------------------------------------------------------------
-- Storage bucket note (create in Dashboard or via API):
--   Bucket name: chat-media
--   Public: false (use signed URLs) OR public: true for simple Phase 1
--   Allowed MIME: image/*, image/gif, application/pdf, text/*, etc.
--   Policy: authenticated members can upload/read under conversation path
-- See README for Dashboard steps.
-- ---------------------------------------------------------------------------
