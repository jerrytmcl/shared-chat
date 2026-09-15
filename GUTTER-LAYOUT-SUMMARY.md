# Focus Room Gutter Layout — Implementation Summary

**PR:** https://github.com/jerrytmcl/shared-chat/pull/5
**Branch:** `cursor/focus-gutter-layout-9d20`
**Status:** ✅ Ready for review

---

## What's Built

### 1. Suggestion Whisper (Right Gutter)
**Component:** `src/components/FocusGutterWhisper.jsx`

- Slim quiet card (280px wide) floats in the right gutter
- No layout push — doesn't disturb the main chat column
- Open button creates/enters focus room
- Dismiss button hides suggestion and creates recoverable sliver
- High bar: only appears when materials warrant attention

### 2. Three-Pane Entered Layout
**Component:** `src/components/FocusThreePane.jsx`

Replaces the full-screen focus room swap with a locked three-pane layout:

- **Left panel (200px):** Return control — "Back to chat" button
- **Center panel (flexible):** Focus thread with messages + composer
- **Right panel (320px):** Episode context with room title, summary, and materials

Smooth CSS transition on entry (respects `prefers-reduced-motion`).

### 3. Dismiss & Recovery
**Components:**
- `src/components/FocusDismissedSliver.jsx` — thin in-stream sliver
- `src/hooks/useDismissedSuggestions.js` — localStorage persistence

**Behavior:**
- Dismiss hides the live suggestion for that material fingerprint
- Creates a thin recoverable sliver in the message stream timeline
- Clicking the sliver restores the suggestion whisper in the gutter
- Persists dismissed suggestions to localStorage (survives refresh)

### 4. Seeding for Tryout
**Hook:** `src/hooks/useFocusRoomSeeding.js`

- Auto-seeds from latest material pile (≥2 link attachments)
- Seeds once per session on load
- Jerry can immediately experience the gutter layout without waiting on Gemini
- Falls back to normal suggestion flow if Gemini provides a live suggestion

### 5. Mobile Responsive
- Gutter whisper → bottom sheet / full overlay on ≤700px screens
- Three-pane layout → stacked vertical layout for mobile

---

## Files Changed

### New Files (5)
1. `src/components/FocusGutterWhisper.jsx` — slim gutter suggestion card
2. `src/components/FocusThreePane.jsx` — three-pane layout for entered focus rooms
3. `src/components/FocusDismissedSliver.jsx` — thin recoverable sliver for dismissed suggestions
4. `src/hooks/useDismissedSuggestions.js` — manage dismissed suggestions with localStorage
5. `src/hooks/useFocusRoomSeeding.js` — auto-seed from latest material pile

### Modified Files (3)
1. `src/App.jsx` — integrated gutter whisper, three-pane layout, dismissed slivers, and seeding logic
2. `src/style.css` — added ~400 lines of CSS for gutter, three-pane, slivers, and mobile responsive styles
3. `docs/PRODUCT.md` — documented the gutter layout model

**Total:** 8 files changed, 968 insertions(+), 48 deletions(-)

---

## How to Try (Local Dev)

1. **Checkout the branch:**
   ```bash
   git fetch origin
   git checkout cursor/focus-gutter-layout-9d20
   ```

2. **Install dependencies (if needed):**
   ```bash
   npm install
   ```

3. **Run dev server:**
   ```bash
   npm run dev
   ```

4. **Open http://localhost:5173** and sign in

5. **Trigger seeded suggestion:**
   - If there's a latest material pile (≥2 link attachments in a row), a focus suggestion whisper will appear in the right gutter on load
   - You can also share 2+ links in a row to trigger a live suggestion

6. **Test the flow:**
   - ✅ **Whisper appears** in right gutter (slim card, no layout push)
   - ✅ **Click "Open"** → smooth transition to three-pane layout
   - ✅ **Left panel** shows "Back to chat" button
   - ✅ **Center panel** shows focus thread (messages + composer)
   - ✅ **Right panel** shows room title, summary, and materials
   - ✅ **Click "Back to chat"** → returns to main chat
   - ✅ **Click × in whisper** → dismisses suggestion, creates thin sliver in message stream
   - ✅ **Click the sliver** → restores whisper in gutter
   - ✅ **Hard refresh** → dismissed slivers persist

---

## How to Try (Production After Merge)

1. **Merge the PR** on GitHub (do not use auto-merge)
2. **Vercel auto-deploys** to production
3. **Visit https://shared-chat.vercel.app** (or your production URL)
4. **Sign in** as Jerry or Corey
5. **Share 2+ links** in a row (or wait for existing pile to settle ~3s)
6. **Gutter whisper appears** → test Open/Dismiss/Restore flow
7. **Enter focus room** → test three-pane layout

---

## Mobile Testing

- **≤700px screens:** gutter whisper becomes bottom sheet overlay
- **Three-pane layout:** stacks vertically (left → center → right becomes top → middle → bottom)
- Test on iPhone/Android or use Chrome DevTools responsive mode

---

## Notes

- **Backward compatible:** existing focus room data (from v1) continues to work
- **No breaking changes:** all existing APIs unchanged (`/api/suggest-focus`, `/api/focus/create`, `/api/analyze`)
- **No migration needed:** localStorage for dismissed suggestions is client-only and gracefully handles missing data
- **No new dependencies:** pure React + existing CSS conventions

---

## Success Criteria ✅

- ✅ PR open (ready for review, not draft): https://github.com/jerrytmcl/shared-chat/pull/5
- ✅ Suggestion appears as slim right-gutter whisper without pushing chat
- ✅ Open animates into left-Return / center-thread / right-materials three-pane layout
- ✅ Dismiss parks a thin in-stream sliver recoverable later
- ✅ Latest pile is seeded so Jerry can try without waiting on Gemini
- ✅ Files changed: 8 files, 968 insertions, 48 deletions
- ✅ How to try: documented above (local dev + production)

---

## Next Steps

1. **Review the PR:** https://github.com/jerrytmcl/shared-chat/pull/5
2. **Test locally** (optional): checkout branch, run `npm run dev`, test flow
3. **Merge when ready** (do not use auto-merge per requirements)
4. **Verify on production** after Vercel deploy completes
