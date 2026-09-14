# Phase 3 — quiet suggestion chips (apply checklist)

## SQL to run (Supabase SQL Editor)

1. If not already applied: `001_initial_schema.sql`, `002_storage_policies.sql`, `003_build_notes_and_join_fix.sql`
2. **New for Phase 3:** run `supabase/migrations/004_chip_package_helpers.sql`
   - Adds RLS so members can update chip payloads (`accepted`) and authors can update own messages
   - `kind` `chip` / `package` and `living_packages` already exist from `001`

## Vercel environment variables

### Client (Vite — `VITE_*` only)

| Variable | Required | Notes |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | yes | Bare project origin |
| `VITE_SUPABASE_ANON_KEY` | yes | Legacy anon key |
| `VITE_CONVERSATION_ID` | optional | Defaults to seeded UUID |

### Server (`/api/suggest` — **never** prefix with `VITE_`)

| Variable | Required | Notes |
| --- | --- | --- |
| `SUPABASE_URL` | yes | Same project URL as client |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Service role — server only |
| `GEMINI_API_KEY` | recommended | Google AI Studio key; also accepts `GOOGLE_GENERATIVE_AI_API_KEY` |

Model: `gemini-2.5-flash-lite` (fallback `gemini-2.5-flash`). If no Gemini key, keyword-overlap fallback only.

**Do not** put `SUPABASE_SERVICE_ROLE_KEY` or `GEMINI_API_KEY` in any `VITE_` variable.

Redeploy after setting env vars.

## Local / demo

- Without Supabase env → demo mode (chips/suggest API not used).
- Vite alone does not run `/api/suggest`; use `vercel dev` or a deployed Preview for chip generation.

## Test steps

1. Apply migration `004` in Supabase.
2. Set Vercel env (client + server) and redeploy.
3. Sign in as a conversation member; ensure ≥2 `original_shares` exist.
4. Send a text message that clearly relates to saved share titles/descriptions.
5. Wait ~3s — a compact **chip** may appear (high bar; often no chip).
6. Tap chip → new **package** message materializes (refs `original_shares`, stores provenance on `living_packages`).
7. Chip stays in history if ignored; after accept it shows “Opened”.
8. Confirm toast notices appear **above the composer**, small, auto-fade ~5s.
