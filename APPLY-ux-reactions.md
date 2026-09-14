# UX pack — material-run flat list, in-bubble times, emoji reactions

## 1. SQL (Supabase SQL Editor)

Run this migration in the Supabase SQL Editor for your project:

- `supabase/migrations/005_message_reactions.sql`

It creates `public.message_reactions` (one reaction per user per message), RLS (members read; users insert/update/delete own rows), indexes, and adds the table to `supabase_realtime`.

If the realtime `ALTER PUBLICATION` errors with “already a member”, the DO block swallows that — safe to re-run.

## 2. Copy files into your local checkout

Unzip `/workspace/shared-chat-ux-reactions.zip` (or the downloaded copy). The archive root is `shared-chat/`. Merge into `~/Downloads/shared-chat`:

```bash
cd ~/Downloads
unzip -o shared-chat-ux-reactions.zip
# If unzip created ./shared-chat/ beside the repo, sync into the repo:
cp -a shared-chat/. ~/Downloads/shared-chat/
```

Or copy only the pack paths:

```bash
REPO=~/Downloads/shared-chat
SRC=./shared-chat   # unzipped folder
cp "$SRC/src/lib/groupMessages.js" "$REPO/src/lib/"
cp "$SRC/src/components/MaterialRun.jsx" "$REPO/src/components/"
cp "$SRC/src/components/MessageReactions.jsx" "$REPO/src/components/"
cp "$SRC/src/hooks/useMessages.js" "$REPO/src/hooks/"
cp "$SRC/src/App.jsx" "$REPO/src/"
cp "$SRC/src/style.css" "$REPO/src/"
mkdir -p "$REPO/supabase/migrations"
cp "$SRC/supabase/migrations/005_message_reactions.sql" "$REPO/supabase/migrations/"
cp "$SRC/APPLY-ux-reactions.md" "$REPO/"
```

## 3. Commit and push

```bash
cd ~/Downloads/shared-chat
git status
git add \
  src/lib/groupMessages.js \
  src/components/MaterialRun.jsx \
  src/components/MessageReactions.jsx \
  src/hooks/useMessages.js \
  src/App.jsx \
  src/style.css \
  supabase/migrations/005_message_reactions.sql \
  APPLY-ux-reactions.md
git commit -m "$(cat <<'EOF'
Add UX pack: living material-run cards, in-bubble times, emoji reactions

Flat run rows with living title/summary, WhatsApp-style timestamps inside
bubbles/cards, and message_reactions schema + realtime toggle UI.
EOF
)"
git push
```

## 4. Verify

1. Apply migration `005` in Supabase.
2. Redeploy / refresh the app.
3. Share 2+ links → collapsed run title should read like `2 from example.com` (not “2 things shared”).
4. Expand run → flat rows (favicon + label + host), no Attachment accordion.
5. Text bubbles show time bottom-right inside the bubble.
6. Hover a message → reaction picker; tap thumbs-up / heart etc.; pills appear under the message.
