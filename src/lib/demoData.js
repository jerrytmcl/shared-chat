/** Seed conversation for local/demo mode when Supabase env is missing. */
export const DEMO_USER = {
  id: 'demo-you',
  display_name: 'You',
  email: 'you@local.dev',
}

export const DEMO_PEER = {
  id: 'demo-friend',
  display_name: 'Friend',
  email: 'friend@local.dev',
}

export const DEMO_MESSAGES = [
  {
    id: 'm1',
    author_id: DEMO_PEER.id,
    author_name: 'Friend',
    kind: 'text',
    body: 'Could we block out the camera move in Blender first?',
    share: null,
    created_at: '2026-09-08T10:42:00.000Z',
  },
  {
    id: 'm2',
    author_id: DEMO_USER.id,
    author_name: 'You',
    kind: 'text',
    body: 'Yes. Dropping a few things here for when we get to it.',
    share: null,
    created_at: '2026-09-08T10:43:00.000Z',
  },
  {
    id: 'm3',
    author_id: DEMO_USER.id,
    author_name: 'You',
    kind: 'attachment',
    body: '',
    share: {
      id: 's3',
      kind: 'link',
      platform: 'X',
      title: 'Camera motion reference',
      description:
        'Sample reference: planning a camera move before generating a shot.',
      href: 'https://x.com/example/status/1',
    },
    created_at: '2026-09-08T10:43:10.000Z',
  },
  {
    id: 'm4',
    author_id: DEMO_USER.id,
    author_name: 'You',
    kind: 'attachment',
    body: '',
    share: {
      id: 's4',
      kind: 'link',
      platform: 'Paper',
      title: 'Keeping movement consistent',
      description:
        'Sample paper reference about consistency between frames.',
      href: 'https://example.com/paper',
    },
    created_at: '2026-09-08T10:43:20.000Z',
  },
  {
    id: 'm5',
    author_id: DEMO_USER.id,
    author_name: 'You',
    kind: 'attachment',
    body: '',
    share: {
      id: 's5',
      kind: 'image',
      title: 'Screenshot 2026-09-08 at 10.44.png',
      description:
        'Sample image: a camera framing a cube. The surrounding conversation connects it to planning a Blender shot.',
      url: null,
    },
    created_at: '2026-09-08T10:44:00.000Z',
  },
  {
    id: 'm6',
    author_id: DEMO_USER.id,
    author_name: 'You',
    kind: 'attachment',
    body: '',
    share: {
      id: 's6',
      kind: 'document',
      title: 'Movement notes.txt',
      description:
        'Sample notes: start still, move slowly toward the subject, then pause.',
    },
    created_at: '2026-09-08T10:44:10.000Z',
  },
  {
    id: 'm7',
    author_id: DEMO_PEER.id,
    author_name: 'Friend',
    kind: 'text',
    body: 'Nice. Let’s try the simple camera move first.',
    share: null,
    created_at: '2026-09-08T10:45:00.000Z',
  },
  {
    id: 'm8',
    author_id: DEMO_USER.id,
    author_name: 'You',
    kind: 'text',
    body: 'Exactly. The rest can wait until we need it.',
    share: null,
    created_at: '2026-09-08T10:45:30.000Z',
  },
]
