-- Focus Rooms v1 — Analysis & Episodes
-- Run in Supabase SQL Editor after migrations 001-008.
-- Adds: analysis_objects, analysis_relations, focus_rooms, focus_items, focus_messages

-- ---------------------------------------------------------------------------
-- Analysis Objects
-- Layered understanding of materials and conversation patterns
-- ---------------------------------------------------------------------------
create table if not exists public.analysis_objects (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  layer text not null check (layer in ('surface', 'intent', 'structure')),
  statement text not null,
  intent text,
  boundaries jsonb not null default '{}'::jsonb,
  standing text not null default 'candidate' check (standing in ('candidate', 'disputed', 'affirmed')),
  share_ids uuid[] not null default '{}',
  message_ids uuid[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists analysis_objects_conversation_idx
  on public.analysis_objects (conversation_id, created_at);
create index if not exists analysis_objects_layer_idx
  on public.analysis_objects (conversation_id, layer);
create index if not exists analysis_objects_standing_idx
  on public.analysis_objects (standing);

comment on table public.analysis_objects is 'Layered understanding of materials and patterns';
comment on column public.analysis_objects.layer is 'surface = immediate facts, intent = inferred purpose, structure = deeper patterns';
comment on column public.analysis_objects.standing is 'candidate = initial, disputed = questioned, affirmed = validated by usage';

-- ---------------------------------------------------------------------------
-- Analysis Relations
-- Connections between analysis objects
-- ---------------------------------------------------------------------------
create table if not exists public.analysis_relations (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  from_id uuid not null references public.analysis_objects(id) on delete cascade,
  to_id uuid not null references public.analysis_objects(id) on delete cascade,
  kind text not null,
  statement text not null,
  standing text not null default 'candidate' check (standing in ('candidate', 'disputed', 'affirmed')),
  created_at timestamptz not null default now(),
  check (from_id != to_id)
);

create index if not exists analysis_relations_conversation_idx
  on public.analysis_relations (conversation_id, created_at);
create index if not exists analysis_relations_from_idx
  on public.analysis_relations (from_id);
create index if not exists analysis_relations_to_idx
  on public.analysis_relations (to_id);

comment on table public.analysis_relations is 'Connections between analysis objects';
comment on column public.analysis_relations.kind is 'e.g. supports, tensions, same_structure_as, implies';

-- ---------------------------------------------------------------------------
-- Focus Rooms
-- Episodes of focused work around material clusters
-- ---------------------------------------------------------------------------
create table if not exists public.focus_rooms (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  title text not null,
  summary text,
  status text not null default 'open' check (status in ('open', 'archived')),
  created_from text not null check (created_from in ('pile', 'request', 'bot')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists focus_rooms_conversation_idx
  on public.focus_rooms (conversation_id, created_at desc);
create index if not exists focus_rooms_status_idx
  on public.focus_rooms (conversation_id, status);

comment on table public.focus_rooms is 'Episodes of focus, not permanent channels';
comment on column public.focus_rooms.created_from is 'pile = from material accumulation, request = user initiated, bot = system suggested';

-- ---------------------------------------------------------------------------
-- Focus Items
-- Many-to-many: which materials belong to which focus room
-- ---------------------------------------------------------------------------
create table if not exists public.focus_items (
  focus_room_id uuid not null references public.focus_rooms(id) on delete cascade,
  share_id uuid not null references public.original_shares(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (focus_room_id, share_id)
);

create index if not exists focus_items_room_idx
  on public.focus_items (focus_room_id);
create index if not exists focus_items_share_idx
  on public.focus_items (share_id);

comment on table public.focus_items is 'Materials included in a focus room';

-- ---------------------------------------------------------------------------
-- Focus Messages
-- Separate message thread within a focus room
-- ---------------------------------------------------------------------------
create table if not exists public.focus_messages (
  id uuid primary key default gen_random_uuid(),
  focus_room_id uuid not null references public.focus_rooms(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists focus_messages_room_idx
  on public.focus_messages (focus_room_id, created_at);

comment on table public.focus_messages is 'Messages within a focus room episode';

-- ---------------------------------------------------------------------------
-- RLS Policies
-- All tables use is_conversation_member(conversation_id) predicate
-- ---------------------------------------------------------------------------

-- analysis_objects
alter table public.analysis_objects enable row level security;

create policy "Users can view analysis in their conversations"
  on public.analysis_objects for select
  using (
    exists (
      select 1 from public.conversation_members
      where conversation_id = analysis_objects.conversation_id
        and user_id = auth.uid()
    )
  );

create policy "Users can insert analysis in their conversations"
  on public.analysis_objects for insert
  with check (
    exists (
      select 1 from public.conversation_members
      where conversation_id = analysis_objects.conversation_id
        and user_id = auth.uid()
    )
  );

create policy "Users can update analysis in their conversations"
  on public.analysis_objects for update
  using (
    exists (
      select 1 from public.conversation_members
      where conversation_id = analysis_objects.conversation_id
        and user_id = auth.uid()
    )
  );

-- analysis_relations
alter table public.analysis_relations enable row level security;

create policy "Users can view relations in their conversations"
  on public.analysis_relations for select
  using (
    exists (
      select 1 from public.conversation_members
      where conversation_id = analysis_relations.conversation_id
        and user_id = auth.uid()
    )
  );

create policy "Users can insert relations in their conversations"
  on public.analysis_relations for insert
  with check (
    exists (
      select 1 from public.conversation_members
      where conversation_id = analysis_relations.conversation_id
        and user_id = auth.uid()
    )
  );

-- focus_rooms
alter table public.focus_rooms enable row level security;

create policy "Users can view focus rooms in their conversations"
  on public.focus_rooms for select
  using (
    exists (
      select 1 from public.conversation_members
      where conversation_id = focus_rooms.conversation_id
        and user_id = auth.uid()
    )
  );

create policy "Users can insert focus rooms in their conversations"
  on public.focus_rooms for insert
  with check (
    exists (
      select 1 from public.conversation_members
      where conversation_id = focus_rooms.conversation_id
        and user_id = auth.uid()
    )
  );

create policy "Users can update focus rooms in their conversations"
  on public.focus_rooms for update
  using (
    exists (
      select 1 from public.conversation_members
      where conversation_id = focus_rooms.conversation_id
        and user_id = auth.uid()
    )
  );

-- focus_items
alter table public.focus_items enable row level security;

create policy "Users can view focus items in their conversations"
  on public.focus_items for select
  using (
    exists (
      select 1 from public.focus_rooms fr
      join public.conversation_members cm
        on fr.conversation_id = cm.conversation_id
      where fr.id = focus_items.focus_room_id
        and cm.user_id = auth.uid()
    )
  );

create policy "Users can insert focus items in their conversations"
  on public.focus_items for insert
  with check (
    exists (
      select 1 from public.focus_rooms fr
      join public.conversation_members cm
        on fr.conversation_id = cm.conversation_id
      where fr.id = focus_items.focus_room_id
        and cm.user_id = auth.uid()
    )
  );

-- focus_messages
alter table public.focus_messages enable row level security;

create policy "Users can view focus messages in their conversations"
  on public.focus_messages for select
  using (
    exists (
      select 1 from public.conversation_members
      where conversation_id = focus_messages.conversation_id
        and user_id = auth.uid()
    )
  );

create policy "Users can insert focus messages in their conversations"
  on public.focus_messages for insert
  with check (
    exists (
      select 1 from public.conversation_members
      where conversation_id = focus_messages.conversation_id
        and user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Optional: Enable realtime for focus_messages
-- Uncomment if you want live updates in focus rooms
-- ---------------------------------------------------------------------------
-- alter publication supabase_realtime add table public.focus_messages;

-- ---------------------------------------------------------------------------
-- Migration complete
-- ---------------------------------------------------------------------------
comment on schema public is 'Focus Rooms v1: analysis + episodes (migration 009)';
