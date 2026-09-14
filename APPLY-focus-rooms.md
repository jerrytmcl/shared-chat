# Apply Focus Rooms v1

This guide walks through applying the focus rooms feature to your Supabase project.

## Prerequisites

- Existing shared-chat app with migrations 001-008 applied
- Supabase project with SQL Editor access
- Environment variables configured (same as before)

## 1. Apply Migration 009

1. Open your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Open `supabase/migrations/009_focus_rooms_analysis.sql` from this repo
4. Copy the entire SQL content
5. Paste into the SQL Editor and click **Run**

This creates the new tables:
- `analysis_objects` — layered understanding of materials
- `analysis_relations` — connections between analysis objects
- `focus_rooms` — episode containers
- `focus_items` — room-material associations
- `focus_messages` — message threads within rooms

All tables have RLS policies based on conversation membership.

## 2. Verify Schema

Check that the tables exist:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN (
    'analysis_objects',
    'analysis_relations', 
    'focus_rooms',
    'focus_items',
    'focus_messages'
  );
```

You should see all 5 tables listed.

## 3. Environment Variables (No Changes)

The new APIs use the same environment variables as existing endpoints:

**Server (Vercel):**
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY` (for auth.getUser)
- `GEMINI_API_KEY` (existing)
- `GEMINI_MODELS` (optional, defaults to `gemini-3.5-flash-lite,gemini-3.6-flash`)

**Client (Vite):**
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_CONVERSATION_ID` (optional)

No new keys needed!

## 4. Deploy

### Option A: Vercel CLI

```bash
vercel --prod
```

### Option B: Git Push (if auto-deploy enabled)

```bash
git push origin main
```

### Option C: Vercel Dashboard

1. Go to your project in Vercel dashboard
2. Click **Deployments** → **Redeploy**

## 5. Test the Flow

### Image Description Test

Upload a screenshot or image in the chat. The system should:
1. Store it in Supabase Storage
2. Call `/api/describe-image` automatically (if wired)
3. Show a content-based title instead of filename

To test the API directly:

```bash
curl -X POST https://your-app.vercel.app/api/describe-image \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"imageUrl": "https://example.com/image.jpg"}'
```

### Focus Room Suggestion Test

Create a material run:
1. Share 2-3 related links or images quickly (no text between them)
2. Wait ~3-5 seconds with no activity
3. A focus room chip should appear: "Open a focus room?"

The chip includes:
- Title (e.g. "AI Design Resources")
- Reason (why it's suggesting focus)
- "Open Focus Room" button

### Accept & Use Focus Room

Click **Open Focus Room**:
1. Navigates to focus room view
2. Shows room title
3. Lists the materials included
4. Provides a message composer
5. "Back to Chat" button returns to main timeline

Try:
- Typing messages in the focus room
- Returning to main chat (room stays available)
- Creating multiple focus rooms from different piles

## 6. Troubleshooting

### Migration fails

- Check that migrations 001-008 are already applied
- Ensure you have `CREATE TABLE` permissions
- Look for conflicts with existing table names (unlikely if following from scratch)

### Focus room chip never appears

Check browser console for errors:
- `/api/analyze` should return 200 with objects array
- `/api/suggest-focus` should return 200 with suggest:true/false
- Ensure JWT is being sent in Authorization header

Check server logs (Vercel → Functions → Logs):
- Look for `[analyze]` and `[suggest-focus]` entries
- Check for Gemini API errors

### Room creation fails

- Verify RLS policies are applied (migration includes them)
- Check conversation membership (user must be in conversation_members)
- Look for foreign key violations (shareIds must exist in original_shares)

### Images not described

- Ensure `GEMINI_API_KEY` is set in Vercel environment
- Check `/api/describe-image` logs for vision API errors
- Gemini vision requires valid image URLs (public or signed)

## 7. Optional: Enable Realtime for Focus Messages

If you want live updates when the other person types in a focus room, uncomment this line in migration 009:

```sql
alter publication supabase_realtime add table public.focus_messages;
```

Or run it separately in SQL Editor.

Then in `FocusRoom.jsx`, add a subscription:

```js
const channel = supabase
  .channel('focus-messages')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'focus_messages',
    filter: `focus_room_id=eq.${roomId}`
  }, (payload) => {
    setMessages(prev => [...prev, payload.new])
  })
  .subscribe()

return () => { supabase.removeChannel(channel) }
```

## Architecture Diagram

```
User shares links/images
  ↓
Material run forms (≥2 items)
  ↓
Debounce settles (~3s)
  ↓
POST /api/analyze
  → Gemini analyzes materials
  → Upserts analysis_objects
  ↓
POST /api/suggest-focus
  → Reads analysis
  → High bar: suggest true/false
  ↓
If suggest:true → show FocusRoomChip
  ↓
User clicks "Open Focus Room"
  ↓
POST /api/focus/create
  → Insert focus_rooms + focus_items
  ↓
Navigate to FocusRoom component
  → Show materials + messages
  → Write to focus_messages
```

## What's Next?

See `docs/ROADMAP.md` for planned features:
- Living packages (Phase 3)
- Analysis refinement based on usage
- Cross-room pattern detection
- Better summarization with multi-modal understanding

---

**Questions?** Check:
- `docs/PRODUCT.md` — product vision & principles
- `docs/ARCHITECTURE.md` — technical details & data model
- `docs/ROADMAP.md` — future plans
