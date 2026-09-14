-- Storage policies for bucket `chat-media`
-- Create the bucket first in Dashboard (Storage → New bucket → chat-media).
-- Then run this migration. Safe to re-run (drops + recreates policies).

-- Allow authenticated users to upload into chat-media
drop policy if exists "Members upload chat media" on storage.objects;
create policy "Members upload chat media"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'chat-media');

drop policy if exists "Members read chat media" on storage.objects;
create policy "Members read chat media"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'chat-media');

drop policy if exists "Members update own chat media" on storage.objects;
create policy "Members update own chat media"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'chat-media' and owner = auth.uid());

drop policy if exists "Members delete own chat media" on storage.objects;
create policy "Members delete own chat media"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'chat-media' and owner = auth.uid());
