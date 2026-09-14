# Roadmap

## Phase 1: Foundation ✅ (Completed)

**Goal:** Basic two-person chat with materials.

- Vite + React UI
- Supabase auth, database, storage
- Material runs (UI grouping of consecutive attachments)
- Link unfurling and enrichment
- File/image/GIF upload
- Search and feedback export
- Living packages schema (not yet surfaced in UI)

## Phase 2: Focus Rooms v1 🚧 (Current)

**Goal:** Episodes of focus emerge from material piles.

### Core Features

- ✅ **Analysis infrastructure**
  - `analysis_objects` and `analysis_relations` tables
  - Layered understanding (surface, intent, structure)
  - `/api/analyze` endpoint

- ✅ **Image understanding**
  - Vision-based descriptions for screenshots
  - `/api/describe-image` endpoint
  - Content-based titles instead of filenames

- ✅ **Focus room suggestion**
  - High-bar detection of coherent material clusters
  - `/api/suggest-focus` endpoint
  - Distinct suggestion chip in UI (not package suggestions)

- ✅ **Focus room creation & navigation**
  - Accept suggestion → create room
  - Thin focus room UI: title, materials, message thread
  - "Return to main chat" flow
  - No persistent sidebar of rooms

### Technical Debt

- Schema validation in APIs (current: trust client input shapes)
- Error boundaries in React components
- Loading states for async operations
- Optimistic updates where appropriate

## Phase 3: Living Packages (Next)

**Goal:** Bot-generated compositions materialize in conversation.

### Planned Features

- **Package suggestion chips** in main timeline
  - Separate from focus room chips
  - Based on `/api/suggest` (existing, currently unused in UI)
  - Appears when saved materials relate to current thread

- **Package materialization**
  - Tap chip → insert living package as message
  - Inline package cards in timeline
  - Provenance visible (what informed it, model used, alternatives)

- **Package interaction**
  - Expand/collapse package contents
  - Jump to constituent materials
  - See package's "reasoning" (provenance)

### Design Questions

- Should packages be editable after materialization?
- How do packages interact with focus rooms? (Can a package seed a room?)
- Decay/refresh: when does an old package become stale?

## Phase 4: Refinement & Intelligence

**Goal:** System learns from usage patterns.

### Candidate Features

- **Standing evolution**
  - Track which analysis objects prove useful (affirmed)
  - Deprecate or challenge outdated understanding (disputed)
  - Use standing to inform future suggestions

- **Cross-room insights**
  - Materials that appear in multiple rooms → meta-patterns
  - Suggest bridging materials when rooms relate

- **Temporal understanding**
  - Decay confidence in old analyses
  - Re-analyze when context shifts significantly

- **Better summarization**
  - Multi-modal understanding (images + text + links together)
  - Thread-aware summaries (not just individual items)

## Phase 5: Collaboration Depth

**Goal:** Richer interaction within focus.

### Ideas

- **Threaded focus discussions**
  - Reply threads within focus rooms
  - Quote/reference specific materials

- **Room states beyond open/archived**
  - "Parked" — might return
  - "Resolved" — done, for reference
  - "Merged" — folded into another room

- **Collaborative editing**
  - Shared notes within a room
  - Joint curation of room materials

- **Export & sharing**
  - Package a room's materials + discussion as artifact
  - Share outside the main conversation (with consent)

## Phase 6: Scale & Performance

**Goal:** Handle years of conversation gracefully.

### Technical Investments

- **Vector/embedding search**
  - Semantic retrieval beyond keyword matching
  - Find related materials across time

- **Analysis pruning**
  - Archive or compress old analyses
  - Rebuild summaries from raw materials as needed

- **Incremental analysis**
  - Don't re-analyze everything on each suggestion
  - Efficient delta updates as new materials arrive

- **Client-side caching**
  - Offline-first message composition
  - Local search index for speed

## Non-Goals

Things we explicitly won't build:

- **Multi-room chat** — no Slack/Discord-style channels
- **Multi-conversation** — stays two people in one space
- **AI as third persona** — system suggests, doesn't chat
- **Public sharing** — built for private, intimate collaboration
- **Mandatory organization** — never force tagging or filing
- **Real-time presence indicators** — typing indicators, online status
- **Notifications beyond web push** — no email/SMS noise
- **Mobile apps** — web-first, responsive design only (for now)

## Success Metrics (Aspirational)

How we'll know if this is working:

- **Adoption**: Jerry & Corey use it daily for actual work
- **Stickiness**: Returning to focus rooms to continue threads
- **Signal quality**: Suggestions accepted >30% of the time (high bar)
- **Reduced context-switching**: Fewer "where was that thing?" moments
- **Emergent organization**: Useful structure forms without forced filing

## Timeline Philosophy

We don't commit to calendar dates. Each phase completes when:
- Core features work end-to-end
- No critical bugs block daily use
- User feedback informs next priorities

Jerry & Corey's real usage drives the roadmap more than any plan.
