# Testing Focus Rooms v1

Quick manual test guide for Jerry & Corey.

## Setup Checklist

- [ ] Migration 009 applied in Supabase SQL Editor
- [ ] Deployed to Vercel (or running locally)
- [ ] Both users can access the chat
- [ ] Environment variables unchanged from before

## Test 1: Basic Material Run

**Goal:** Verify material runs still work as before.

1. Share a link
2. Share another link immediately after
3. Both should collapse into a material run card
4. Expand/collapse should work
5. No focus room chip should appear yet (wait for Test 2)

**Expected:** Normal material run behavior unchanged.

## Test 2: Focus Room Suggestion

**Goal:** Trigger a focus room suggestion.

1. Start fresh (reload page)
2. Share 2-3 **related** links about the same topic quickly:
   - Example: 3 articles about AI tools
   - Example: 2 GitHub repos + 1 doc link about the same project
3. **Don't type any text** — keep it attachment-only
4. Wait 3-5 seconds without doing anything
5. Look for the focus room chip to appear below the material run

**Expected:**
- Chip appears with:
  - Title (e.g., "AI Design Tools")
  - Reason (e.g., "Coherent cluster around design tooling")
  - "Open Focus Room" button

**If it doesn't appear:**
- Check browser console for errors
- Check Vercel function logs for `/api/analyze` and `/api/suggest-focus`
- Try again with more obviously related materials

## Test 3: Accept Focus Room

**Goal:** Create and enter a focus room.

1. Click "Open Focus Room" on the chip
2. UI should transition to focus room view

**Expected:**
- Header shows "Back" button + room title
- Materials section shows the 2-3 links you shared
- Empty message thread
- Composer at bottom

## Test 4: Focus Room Messages

**Goal:** Chat within a focus room.

1. Type a message in the focus room composer
2. Press Enter
3. Message should appear in the thread

**Expected:**
- Message shows immediately
- Your messages appear on the right (blue bubble)
- Styling matches main chat feel

**Bonus:** Have the other person join the same room and send a message (their messages should appear on the left).

## Test 5: Return to Main Chat

**Goal:** Navigate back.

1. Click "Back to Chat" (or back button in header)
2. Should return to main chat timeline

**Expected:**
- Original messages still there
- Focus room chip may still be visible (dismissible)
- Chat continues normally

## Test 6: Multiple Focus Rooms

**Goal:** Create multiple independent rooms.

1. Share a new pile of materials on a **different** topic
2. Wait for suggestion
3. Accept → creates second room
4. Navigate back
5. (Optional) Try to manually access first room later — not yet implemented, so just verify main chat works

**Expected:**
- Each room is independent
- Main chat remains the home base

## Test 7: Screenshot Description (If Wired)

**Goal:** Vision-based image titles.

1. Upload a screenshot (not just any image — a screenshot of a webpage, tool, etc.)
2. System should call `/api/describe-image`
3. Title should reflect content, not filename

**Expected:**
- Title like "Dashboard showing analytics graphs" instead of "Screenshot 2024-01-15.png"
- Description may appear in hover/detail view

**Note:** This may need additional wiring depending on current image upload flow. Check if `describe-image` is called in `useEnrichShares` or similar.

## Test 8: High Bar Verification

**Goal:** Confirm suggestions are conservative.

1. Share 2 **unrelated** links (e.g., one recipe, one tech article)
2. Wait 5 seconds
3. Should **NOT** get a focus room suggestion

**Expected:**
- Model returns `suggest: false`
- No chip appears
- System stays quiet (high bar working)

## Troubleshooting

### No suggestions appearing

**Check browser console:**
```
Failed to fetch /api/suggest-focus
```
→ Likely auth issue or API not deployed

**Check Vercel logs:**
```
[suggest-focus] model declined
```
→ Working as intended (high bar)

```
[analyze] analyzing { shareCount: 2 }
[suggest-focus] suggesting { title: "...", reason: "..." }
```
→ Working! Wait a bit longer, or check if chip is hidden by scroll

### Room creation fails

**Console error:**
```
focus room create failed 403
```
→ RLS policy issue or not a conversation member

**Check Supabase logs (Dashboard → Logs):**
- Look for INSERT failures on `focus_rooms` or `focus_items`
- Verify migration 009 RLS policies are applied

### Images not described

- Ensure `GEMINI_API_KEY` is set in Vercel
- Check function logs for Gemini API errors (quota, invalid key)
- Vision endpoint requires valid image URLs

## Success Criteria

- [x] Material runs still work
- [x] Focus room chip appears for related materials
- [x] Chip has sensible title + reason
- [x] Accept creates room and navigates
- [x] Can send messages in room
- [x] Can return to main chat
- [x] No chip for unrelated materials (high bar)

## What to Watch For

**Good signs:**
- Suggestions feel smart, not spammy
- Titles are thematic ("AI design threads") not generic ("Shared links")
- High bar: false negatives okay, false positives bad

**Bad signs:**
- Every 2-link pile triggers a suggestion (bar too low)
- Titles are nonsense or just domain names
- UI feels cluttered or distracting

**Feedback:**
Note what works, what doesn't. This is v1 — expect iteration.

## Next Steps After Testing

1. Share screenshots of focus room UI
2. Note any suggestion quality issues (bad titles, wrong suggestions)
3. Identify missing features or rough edges
4. Decide: ready for daily use, or needs tuning?

See `docs/ROADMAP.md` for what's planned next (living packages, Phase 3).
