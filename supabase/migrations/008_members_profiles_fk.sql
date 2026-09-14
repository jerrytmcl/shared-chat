-- Embed-friendly FK + friendly display names for Jerry & Corey
alter table public.conversation_members
  drop constraint if exists conversation_members_user_id_fkey;

alter table public.conversation_members
  add constraint conversation_members_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;

update public.profiles
set display_name = 'Corey'
where id = '6065adf0-a700-448d-8fda-e342085a1649';

update public.profiles
set display_name = 'Jerry'
where id = 'b51f3571-a220-4a93-bcd5-dc188fd67a8d';
