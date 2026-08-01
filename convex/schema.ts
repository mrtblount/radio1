import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ── v1 radio control plane (ephemeral, swept) ──────────────────────────

  // Presence: one row per active session in a channel. Swept when stale (I5).
  members: defineTable({
    sessionId: v.string(),
    name: v.string(),
    channel: v.string(),
    joinedAt: v.number(),
    lastSeen: v.number(),
    // Stable device identity (v2) — links radio presence to the user layer.
    userId: v.optional(v.string()),
  })
    .index("by_session", ["sessionId"])
    .index("by_channel", ["channel"])
    .index("by_lastSeen", ["lastSeen"]),

  // Floor control: at most one row per channel = the current talker (I1).
  floor: defineTable({
    channel: v.string(),
    sessionId: v.string(),
    name: v.string(),
    since: v.number(),
    expiresAt: v.number(),
  })
    .index("by_channel", ["channel"])
    .index("by_expiresAt", ["expiresAt"]),

  // WebRTC signaling relay: consumable messages. Live audio never touches
  // the backend (I3′) — only finished transmission clips do, in `transmissions`.
  signals: defineTable({
    toSession: v.string(),
    fromSession: v.string(),
    channel: v.string(),
    kind: v.union(v.literal("offer"), v.literal("answer"), v.literal("ice")),
    payload: v.string(),
    createdAt: v.number(),
  })
    .index("by_recipient", ["toSession"])
    .index("by_createdAt", ["createdAt"]),

  // ── v2 platform (durable) ──────────────────────────────────────────────

  // Device-local identity: no accounts. One row per device-minted userId.
  users: defineTable({
    userId: v.string(),
    name: v.string(),
    createdAt: v.number(),
    // Heartbeat while the app is open — "online" dots + push suppression.
    lastActiveAt: v.number(),
    prefs: v.object({
      dashOpen: v.optional(v.boolean()),
      notifyEnabled: v.optional(v.boolean()),
    }),
    // Test-run identities (e2e): swept with their content after an hour.
    ephemeral: v.optional(v.boolean()),
  })
    .index("by_userId", ["userId"])
    .index("by_lastActiveAt", ["lastActiveAt"]),

  // Channels: team channels double as radio channels (key = radio channel
  // string); DMs are 2-person channels usable for both text and direct PTT.
  channels: defineTable({
    key: v.string(),
    name: v.string(),
    kind: v.union(v.literal("team"), v.literal("dm")),
    // Presentation mode (v3): "ptt" = radio-first (default), "text" = chat-first
    // (no radio emphasis, hidden from the go-on-duty picker). Optional so every
    // existing row stays valid — absent means "ptt".
    mode: v.optional(v.union(v.literal("ptt"), v.literal("text"))),
    // Only admins may post (the Announcements channel).
    postRestricted: v.boolean(),
    archived: v.boolean(),
    // DM channels: the two participants' userIds, sorted.
    dmMembers: v.optional(v.array(v.string())),
    createdBy: v.string(),
    createdAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_kind", ["kind"]),

  // ── Channel agents (v3, Buzz-style) — AI members of team channels ──────
  // ADDITIVE: new table, written only by convex/agents.ts. An agent posts
  // into the normal `messages` stream with userId = its agentId ("agent_…"),
  // so history, unread badges, and push all work unchanged.
  agents: defineTable({
    agentId: v.string(), // "agent_<random>" — never collides with device ids
    name: v.string(),
    // The persona/brief the responder runs with (plain text).
    instructions: v.string(),
    // Channels this agent is a member of (team channel keys).
    channelKeys: v.array(v.string()),
    // "mention" = speaks only when named; "all" = weighs in on every
    // transmission/message (radio discipline still applies in the prompt).
    listenMode: v.union(v.literal("mention"), v.literal("all")),
    active: v.boolean(),
    createdBy: v.string(),
    createdAt: v.number(),
  }).index("by_agentId", ["agentId"]),

  // One stream of history per channel: text, announcements, system events,
  // and radio transmission clips interleaved.
  messages: defineTable({
    channelKey: v.string(),
    userId: v.string(),
    name: v.string(),
    kind: v.union(
      v.literal("text"),
      v.literal("announce"),
      v.literal("system"),
      v.literal("clip"),
    ),
    body: v.string(),
    clipId: v.optional(v.id("transmissions")),
    // @mentions resolved at send time (names denormalized for rendering).
    mentions: v.optional(
      v.array(v.object({ userId: v.string(), name: v.string() })),
    ),
    createdAt: v.number(),
  }).index("by_channel", ["channelKey", "createdAt"]),

  // Read cursors → unread badges (covers text and missed clips alike).
  // Also carries the per-channel alert level (same (user, channel) key).
  reads: defineTable({
    userId: v.string(),
    channelKey: v.string(),
    lastReadAt: v.number(),
    alertLevel: v.optional(
      v.union(v.literal("all"), v.literal("mentions"), v.literal("mute")),
    ),
  }).index("by_user_channel", ["userId", "channelKey"]),

  // Typing beacons (self-expiring via `until`).
  typing: defineTable({
    channelKey: v.string(),
    userId: v.string(),
    name: v.string(),
    until: v.number(),
  }).index("by_channel", ["channelKey"]),

  // Finished transmission clips (I3′): recorded at the sender, uploaded after
  // release. The live path stays P2P.
  transmissions: defineTable({
    channelKey: v.string(),
    userId: v.string(),
    name: v.string(),
    sessionId: v.string(),
    startedAt: v.number(),
    durationMs: v.number(),
    storageId: v.id("_storage"),
    mimeType: v.string(),
    transcript: v.optional(v.string()),
    transcriptStatus: v.union(
      v.literal("pending"),
      v.literal("done"),
      v.literal("failed"),
      v.literal("skipped"), // no GROQ_API_KEY configured
      v.literal("too_short"), // < 1s — short bursts hallucinate (SPEC 9.2.4)
    ),
    // Derived from Whisper segment stats; "low" renders a LOW CONF tag.
    transcriptConfidence: v.optional(
      v.union(v.literal("ok"), v.literal("low")),
    ),
    // One-tap COPY acks (D24) — tiny per-team arrays, denormalized names.
    acks: v.optional(
      v.array(
        v.object({ userId: v.string(), name: v.string(), at: v.number() }),
      ),
    ),
  })
    .index("by_channel", ["channelKey", "startedAt"])
    .searchIndex("search_transcript", {
      searchField: "transcript",
      filterFields: ["channelKey"],
    }),

  // Direct-PTT "ring": tells the callee's radio to auto-switch to the DM
  // channel so the call is live. Self-expiring; swept.
  directCalls: defineTable({
    channelKey: v.string(),
    fromUserId: v.string(),
    fromName: v.string(),
    toUserId: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_to", ["toUserId"])
    .index("by_expiresAt", ["expiresAt"]),

  // Web Push subscriptions (one row per browser endpoint).
  pushSubs: defineTable({
    userId: v.string(),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    ua: v.string(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_endpoint", ["endpoint"]),

  // AI ops thread: single thread per user.
  aiMessages: defineTable({
    userId: v.string(),
    role: v.union(v.literal("user"), v.literal("assistant")),
    // Working-state narration or plain text; blocks land in blocksJson.
    text: v.string(),
    blocksJson: v.optional(v.string()),
    status: v.union(
      v.literal("thinking"),
      v.literal("done"),
      v.literal("error"),
    ),
    createdAt: v.number(),
  }).index("by_user", ["userId", "createdAt"]),

  // Daily checklist: seeded each morning from the template.
  tasks: defineTable({
    date: v.string(), // YYYY-MM-DD (team-local)
    label: v.string(),
    order: v.number(),
    done: v.boolean(),
    doneByName: v.optional(v.string()),
    createdBy: v.string(),
    // Provenance when created from a transmission clip (D24); dedupe key.
    sourceTransmissionId: v.optional(v.id("transmissions")),
  }).index("by_date", ["date"]),

  taskTemplate: defineTable({
    label: v.string(),
    order: v.number(),
    active: v.boolean(),
  }),

  // Feature flags / team settings singleton (I7).
  settings: defineTable({
    aiEnabled: v.boolean(),
    orgName: v.optional(v.string()),
  }),
});
