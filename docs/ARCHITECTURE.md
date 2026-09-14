# Architecture

## Technology Stack

- **Frontend:** Vite + React
- **Backend:** Vercel Serverless Functions (Node.js)
- **Database:** Supabase (Postgres + realtime + auth + storage)
- **AI:** Google Gemini (Flash models)
- **Hosting:** Vercel

## Architecture Spine

The focus room feature builds on the existing material-handling infrastructure with a layered analysis approach:

```
Material Flow:
  Link/Image Upload
    ↓
  unfurl.js (existing) → enrich with metadata
    ↓
  describe-image.js (NEW) → vision-based titles for screenshots
    ↓
  run-copy.js (existing) → surface-level card summaries
    ↓
  Material pile settles (≥2 items, no new activity)
    ↓
  analyze.js (NEW) → layered relevance analysis
    ↓
  suggest-focus.js (NEW) → high-bar focus room suggestion
    ↓
  User accepts → focus room created
```

## Data Model

### Core Tables (Existing)

- **profiles** — user display info (extends auth.users)
- **conversations** — chat containers (Phase 1: one hardcoded)
- **conversation_members** — who's in which conversation
- **original_shares** — durable ground truth for all materials
- **messages** — chat timeline (text, attachments, chips, packages)
- **living_packages** — compositions of shares with provenance

### New Tables (Focus Rooms v1)

#### analysis_objects
Stores layered understanding of materials and conversation patterns.

```sql
{
  id: uuid,
  conversation_id: uuid,
  layer: 'surface' | 'intent' | 'structure',
  statement: text,           -- what this object represents
  intent: text,              -- nullable; for intent layer
  boundaries: jsonb,         -- scope/applicability
  standing: 'candidate' | 'disputed' | 'affirmed',
  share_ids: uuid[],         -- materials this relates to
  message_ids: uuid[],       -- messages this emerged from
  metadata: jsonb,           -- model, confidence, etc.
  created_at, updated_at
}
```

**Layers:**
- **Surface:** immediate facts about materials (topics, formats, sources)
- **Intent:** inferred purpose or direction in sharing them
- **Structure:** deeper patterns across multiple materials

#### analysis_relations
Connections between analysis objects.

```sql
{
  id: uuid,
  conversation_id: uuid,
  from_id: uuid,             -- analysis_objects.id
  to_id: uuid,               -- analysis_objects.id
  kind: text,                -- 'supports', 'tensions', 'same_structure_as', etc.
  statement: text,           -- what this relation represents
  standing: 'candidate' | 'disputed' | 'affirmed',
  created_at
}
```

#### focus_rooms
Episodes of focused work around material clusters.

```sql
{
  id: uuid,
  conversation_id: uuid,
  title: text,
  summary: text,
  status: 'open' | 'archived',
  created_from: 'pile' | 'request' | 'bot',
  created_by: uuid,          -- user who created or accepted
  created_at, updated_at
}
```

#### focus_items
Many-to-many between rooms and materials.

```sql
{
  focus_room_id: uuid,
  share_id: uuid,
  PRIMARY KEY (focus_room_id, share_id)
}
```

#### focus_messages
Separate message thread within a focus room.

```sql
{
  id: uuid,
  focus_room_id: uuid,
  conversation_id: uuid,     -- for RLS context
  author_id: uuid,
  body: text,
  created_at
}
```

## API Endpoints

### Existing

- **POST /api/unfurl** — fetch link metadata
- **POST /api/run-copy** — generate card summaries for material runs
- **POST /api/suggest** — suggest living packages from saved materials

### New (Focus Rooms v1)

#### POST /api/describe-image
Vision-based content understanding for screenshots and images.

**Input:**
```json
{
  "shareId": "uuid" // or "imageUrl": "https://..."
}
```

**Output:**
```json
{
  "title": "Content-based title",
  "description": "What's visible in the image"
}
```

Updates `original_shares` with the generated title/description.

#### POST /api/analyze
Layered relevance analysis of materials.

**Input:**
```json
{
  "conversationId": "uuid",
  "shareIds": ["uuid", ...],
  "recentMessages": [...] // optional context
}
```

**Output:**
```json
{
  "objects": [
    {
      "id": "uuid",
      "layer": "surface",
      "statement": "Collection of AI design resources",
      "shareIds": [...],
      ...
    }
  ]
}
```

Upserts into `analysis_objects` and optionally `analysis_relations`.

#### POST /api/suggest-focus
High-bar suggestion for creating a focus room.

**Input:**
```json
{
  "conversationId": "uuid",
  "shareIds": ["uuid", ...]
}
```

**Output:**
```json
{
  "suggest": true,
  "title": "AI Design Resources",
  "reason": "Coherent cluster around design tooling with AI",
  "shareIds": ["uuid", ...],
  "analysisIds": ["uuid", ...]
}
// or { "suggest": false }
```

Calls `/api/analyze` internally, applies high bar for suggestion quality.

#### POST /api/focus/create
Create a focus room from accepted suggestion.

**Input:**
```json
{
  "conversationId": "uuid",
  "title": "string",
  "shareIds": ["uuid", ...],
  "analysisIds": ["uuid", ...] // optional
}
```

**Output:**
```json
{
  "roomId": "uuid",
  "title": "string"
}
```

Inserts into `focus_rooms` and `focus_items`.

## Authentication & Authorization

All endpoints follow the existing pattern:

1. Client includes `Authorization: Bearer <supabase_jwt>` header
2. API validates token using Supabase anon key + `auth.getUser()`
3. API switches to service role key for data operations
4. RLS policies enforce conversation membership

Function `is_conversation_member(conversation_id uuid)`:
```sql
exists (
  select 1 from conversation_members
  where conversation_id = $1
    and user_id = auth.uid()
)
```

All new tables use this RLS predicate.

## Client-Side Flow

### Image Upload & Description
```
User uploads image/screenshot
  ↓
Store in Supabase Storage + create original_share
  ↓
Call /api/describe-image with shareId
  ↓
Update share record with vision-based title
  ↓
UI shows content-based title instead of filename
```

### Focus Room Suggestion
```
Material run forms (≥2 items)
  ↓
Debounce: no new items for ~3s
  ↓
Call /api/analyze (background)
  ↓
Call /api/suggest-focus
  ↓
If suggest:true → show chip in UI
  ↓
User taps chip
  ↓
Call /api/focus/create
  ↓
Navigate to FocusRoom component
```

### Focus Room UX
```
<FocusRoom roomId={...}>
  - Room title at top
  - List of materials (cards/thumbnails)
  - Message list (focus_messages)
  - Composer (writes to focus_messages)
  - "Back to chat" navigation
</FocusRoom>
```

## Environment Variables

Same as existing:

**Client (Vite, prefixed with `VITE_`):**
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_CONVERSATION_ID` (optional, defaults to seed UUID)

**Server (Vercel functions, no prefix):**
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY` (used for auth.getUser)
- `GEMINI_API_KEY`
- `GEMINI_MODELS` (optional, defaults to `gemini-3.5-flash-lite,gemini-3.6-flash`)

## Future Considerations

- **Realtime for focus_messages** — currently optional; add subscription if needed
- **Room archival flow** — currently manual status update; could auto-archive after inactivity
- **Analysis refinement** — standing transitions (candidate → affirmed) based on usage
- **Cross-room patterns** — identify materials that bridge multiple rooms
- **Temporal decay** — older analyses might need refresh or deprecation signals
