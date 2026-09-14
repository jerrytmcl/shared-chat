# Shared Chat — Phase 1

Private two-person shared chat for **Jerry** and **Corey**. One conversation. Dump work links, files, and GIFs. Consecutive attachment-only messages from one author collapse into expandable **material-run** cards (UI grouping only — not a DB entity).

Product rules are locked. This scaffold matches the interaction-study-0.3 prototype UI and wires Supabase for auth, messages, original shares, and (schema-ready) living packages.

**Repo (Jerry will push manually):** https://github.com/jerrytmcl/shared-chat

---

## Quick start (local demo — no Supabase required)

```bash
cd shared-chat
npm install
npm run dev
```

Open http://localhost:5173. Without `.env`, the app runs in **demo mode**: sample conversation, local state, no persistence. UI, material runs, link paste, file preview, search, and feedback export all work.

```bash
npm run build    # production build → dist/
npm run preview  # preview the build
```

---

## Environment

Copy `.env.example` → `.env` and fill in values from the Supabase dashboard:

```bash
cp .env.example .env
```

| Variable | Required | Description |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | for live mode | Project URL (Settings → API) |
| `VITE_SUPABASE_ANON_KEY` | for live mode | Anon/public key (Settings → API) |
| `VITE_CONVERSATION_ID` | optional | Defaults to the seeded UUID `00000000-0000-4000-8000-000000000001` |

**Never commit `.env`.** It is gitignored. Only `.env.example` ships.

If env is missing or still contains placeholder values, the app stays in demo mode gracefully.

---

## Supabase setup (manual — Jerry)

### 1. Create project

1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. **New project** → pick org, name (`shared-chat`), region, DB password
3. Wait for provisioning

### 2. Run migrations

1. Open **SQL Editor**
2. Paste and run `supabase/migrations/001_initial_schema.sql`
3. Paste and run `supabase/migrations/002_storage_policies.sql` **after** creating the storage bucket (step 4)

Migration `001` creates:

- `profiles`, `conversations`, `conversation_members`
- `original_shares` (durable ground truth: link | image | document | gif)
- `living_packages` (+ `provenance` jsonb) — schema ready; Phase 1 UI does not generate packages
- `messages` with kinds: `text` | `attachment` | `chip` | `package` (chip/package reserved for Phase 3)
- RLS policies, realtime publication on `messages` + `original_shares`
- Seed conversation: `00000000-0000-4000-8000-000000000001` titled **Jerry & Corey**

### 3. Auth providers

**Magic link (Email OTP)**

1. **Authentication → Providers → Email**
2. Enable Email
3. Confirm **Magic Link** / OTP is on
4. (Optional) disable password signup if you only want magic links
5. **Authentication → URL Configuration**
   - Site URL: your local or Vercel URL (e.g. `http://localhost:5173` or `https://shared-chat.vercel.app`)
   - Redirect URLs: add the same origins

**Google**

1. Create OAuth credentials in [Google Cloud Console](https://console.cloud.google.com/) (OAuth 2.0 Client ID, Web application)
2. Authorized redirect URI: `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
3. **Authentication → Providers → Google** → enable → paste Client ID + Secret

### 4. Storage bucket

1. **Storage → New bucket**
2. Name: `chat-media`
3. Public: **on** for simple Phase 1 (or off + signed URLs later)
4. File size limit: e.g. 20 MB
5. Allowed MIME: `image/*`, `image/gif`, `application/pdf`, `text/*`, etc.
6. Then run `002_storage_policies.sql` so authenticated users can upload/read

Uploads go under `{conversation_id}/{user_id}/{timestamp}-{filename}`.

If Storage is not configured, the app falls back to local Data URL previews and shows a toast.

### 5. Two-user join

1. Jerry and Corey each sign in (magic link or Google)
2. On first successful send (or manually), the client upserts the current user into `conversation_members` for the hardcoded conversation
3. To pre-seed membership after both have accounts, run in SQL Editor (replace UUIDs with real `auth.users` ids):

```sql
insert into public.conversation_members (conversation_id, user_id, role)
values
  ('00000000-0000-4000-8000-000000000001', 'JERRY_USER_UUID', 'owner'),
  ('00000000-0000-4000-8000-000000000001', 'COREY_USER_UUID', 'member')
on conflict do nothing;
```

Find user ids: **Authentication → Users**.

### 6. Copy API keys into `.env`

**Project Settings → API** → `Project URL` and `anon` `public` key → put in `.env` as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

Restart `npm run dev`.

---

## Product rules (locked)

- Consecutive **attachment-only** messages from one author → expandable material-run cards; a **text** message ends the run
- Human runs = **UI grouping only**, not a DB entity
- **Original shares** = durable ground truth; **living packages** = cheap disposable compositions referencing share ids (reconstructable)
- Living packages store **provenance** jsonb (what informed creation, models, prompts, params, candidates vs chosen, timestamps)
- Phase 3 (later): suggestion **chips** in timeline; tap materializes a **new** living package inline — **not** in Phase 1 UI
- **GIFs** are first-class chat media; not used for package composition in v1
- AI is **not** a third chat persona
- Two users only; one conversation; no scope creep

---

## Schema sketch

```
profiles ← auth.users
conversations (1 seeded)
conversation_members (2 users)
original_shares (link | image | document | gif)
living_packages (share_ids[], provenance jsonb)
messages (kind: text | attachment | chip | package)
         → share_id / package_id / chip_payload
```

---

## Push to GitHub (Jerry — manual)

Do **not** put secrets in the repo. From this machine or after copying the zip:

```bash
cd shared-chat
git init
git add .
git status   # confirm .env is NOT listed
git commit -m "Phase 1 scaffold: Vite React UI, Supabase schema, demo mode"
git branch -M main
git remote add origin https://github.com/jerrytmcl/shared-chat.git
git push -u origin main
```

If the remote already has a README/license, pull/rebase or force only if you intend to overwrite.

---

## Vercel deploy notes

1. Import `jerrytmcl/shared-chat` in [Vercel](https://vercel.com)
2. Framework: Vite (auto-detected)
3. Build: `npm run build` · Output: `dist`
4. **Environment variables** (Production + Preview):
   - Client: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, optional `VITE_CONVERSATION_ID`
   - Server (`/api/suggest`, never `VITE_`): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, recommended `GEMINI_API_KEY`
5. Deploy
6. Add the Vercel URL to Supabase **Authentication → URL Configuration** (Site URL + Redirect URLs)
7. Phase 3: apply `supabase/migrations/004_chip_package_helpers.sql` — see `APPLY.md`

---

## Implemented vs deferred

| Implemented (Phase 1) | Deferred |
| --- | --- |
| Vite + React UI matching prototype | Semantic search / AI retrieval |
| Material-run collapse/expand | Multi-room / multi-conversation |
| Demo mode without env | Package composition from GIFs |
| Suggestion chips + living packages (Phase 3) | Semantic search / vector index |
| Supabase client + migrations | Multi-room / multi-conversation |
| Magic link + Google auth flows | Package composition from GIFs |
| One hardcoded conversation | Automatic AI chat persona |
| Messages + original shares | Vector / graph indexing |
| Realtime when env present | Full ambitious backend from design brief |
| Link paste (newline URLs → links) | Image OCR / visual understanding |
| File/GIF upload when Storage OK | Feedback delivery pipeline |
| Schema: living_packages + provenance + chip/package kinds | Git push / Cloud Agents |
| Search panel (local text match) | |
| Feedback export (local JSON) | |

---

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |

---

## License

Private. For Jerry & Corey only.
