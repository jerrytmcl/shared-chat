# Product Vision

## North Star

**A private chat with someone who matters — where you never have to choose between staying present and keeping the threads of your life together, because the deeper patterns surface when you need them.**

## Core Concepts

### Main Chat: Home Base

The main chat remains the primary interaction space. It's where you stay present, dump links, share screenshots, exchange thoughts. No sidebar clutter, no forced organization. Just conversation.

### Focus Rooms: Episodes of Focus

Focus rooms are **episodes of focus**, not permanent sidebar folders or categories. They emerge when a pile of materials warrants deeper attention — you can suggest spinning one out, or the system might offer one when patterns align.

**Verbs:**
- **Suggest/spin out** — create a room around a cluster of materials
- **Stay** — work within the room's focused context
- **Point/add** — bring specific items into the room
- **Return** — come back to main chat; the room stays available but archived

**Dual Agency:**
Both human and bot can suggest focus rooms. The system watches for piles that might benefit from focused attention, but always maintains a high bar — better to stay silent than to interrupt incorrectly.

### Gutter Layout Model

Focus room suggestions and active rooms use a **locked gutter layout** that respects the chat-first nature of the app:

**1. Suggestion (Whisper):**
- Slim, quiet card in the **right gutter** (280px wide)
- No layout push — floats over the chat without disturbing the main column
- Easily dismissible; can be restored from a thin in-stream sliver
- High bar: only appears when materials truly warrant focused attention

**2. Entered (Three-Pane Push):**
- **Left Panel (200px):** Return control — "Back to chat" button
- **Center Panel (flexible):** Focus thread — messages and composer for the room
- **Right Panel (320px):** Episode context — room title, summary, and seeded materials
- Smooth CSS transition on entry (respects `prefers-reduced-motion`)

**3. Dismissed:**
- Hides the live suggestion for that material fingerprint
- Collapses into a **thin recoverable sliver** in the main chat timeline
- Clicking the sliver restores the suggestion in the gutter
- Persisted to localStorage so dismissed suggestions survive refresh

**4. Mobile:**
- Gutter whisper becomes a bottom sheet or full overlay (≤700px)
- Three-pane layout stacks vertically for small screens

### Materials, Not Messages

Links, images, documents, and GIFs are first-class **materials** that persist independently of the conversation flow. The system understands their content and relationships, making them available when relevant regardless of when they were shared.

## Design Principles

1. **Stay present first** — Don't force organization upfront; let structure emerge
2. **High bar on suggestions** — Prefer silence over noise
3. **Dual agency** — Both people and system can initiate focus
4. **Episodes, not hierarchy** — Rooms are temporary work contexts, not permanent folders
5. **Materials are durable** — Content lives beyond the moment it was shared
6. **Private and intimate** — Built for deep collaboration between people who matter to each other

## What This Isn't

- **Not** a knowledge base with mandatory tagging
- **Not** a multi-room chat with persistent channels
- **Not** an AI assistant that joins the conversation as a third person
- **Not** forced organization or automatic filing
- **Not** search-first retrieval (though search exists as a tool)

## Visual Identity

The experience should feel:
- Calm and uncluttered
- Intimate and personal
- Smart without being intrusive
- Focused when it needs to be, relaxed otherwise
