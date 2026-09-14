-- Allow conversation members to update share metadata (title/description/etc.)
-- Needed so client-side enrich (useEnrichShares) can persist unfurl results.
-- Without this, SELECT/INSERT work but UPDATE is silently blocked by RLS.

drop policy if exists "Members update shares" on public.original_shares;
create policy "Members update shares"
  on public.original_shares for update
  to authenticated
  using (public.is_conversation_member(conversation_id))
  with check (public.is_conversation_member(conversation_id));
