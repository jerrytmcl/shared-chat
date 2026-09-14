-- Phase 3: chip / package helpers
-- Schema already allows kind chip|package and living_packages insert (001).
-- Add member UPDATE on own chip_payload (e.g. accepted=true) and ensure
-- package messages can reference living_packages.

-- Members may update messages they authored (chip accept / light metadata)
drop policy if exists "Authors update own messages" on public.messages;
create policy "Authors update own messages"
  on public.messages for update
  to authenticated
  using (
    author_id = auth.uid()
    and public.is_conversation_member(conversation_id)
  )
  with check (
    author_id = auth.uid()
    and public.is_conversation_member(conversation_id)
  );

-- Optional: any member can mark a chip accepted (shared quiet UX)
drop policy if exists "Members update chip payload" on public.messages;
create policy "Members update chip payload"
  on public.messages for update
  to authenticated
  using (
    kind = 'chip'
    and public.is_conversation_member(conversation_id)
  )
  with check (
    kind = 'chip'
    and public.is_conversation_member(conversation_id)
  );

-- living_packages insert/update already covered in 001 for members.
-- No schema changes required for share_ids / provenance jsonb.
