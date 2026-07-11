import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Presence: one row per active session in a channel. Swept when stale (I5).
  members: defineTable({
    sessionId: v.string(),
    name: v.string(),
    channel: v.string(),
    joinedAt: v.number(),
    lastSeen: v.number(),
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

  // WebRTC signaling relay: consumable messages. Audio never touches this (I3).
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
});
