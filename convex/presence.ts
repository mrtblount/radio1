import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { assertCode, checkCode } from "./access";

// A member is considered live if seen within this window.
export const FRESH_MS = 30_000;

export const join = mutation({
  args: {
    sessionId: v.string(),
    name: v.string(),
    channel: v.string(),
    userId: v.optional(v.string()),
    accessCode: v.optional(v.string()),
  },
  handler: async (ctx, { sessionId, name, channel, userId, accessCode }) => {
    const gate = checkCode(accessCode);
    if (gate !== "ok") {
      return { ok: false as const, reason: `code-${gate}` as const };
    }
    const now = Date.now();
    const existing = await ctx.db
      .query("members")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { name, channel, lastSeen: now, userId });
    } else {
      await ctx.db.insert("members", {
        sessionId,
        name,
        channel,
        joinedAt: now,
        lastSeen: now,
        userId,
      });
    }
    return { ok: true as const };
  },
});

export const heartbeat = mutation({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    const now = Date.now();
    const member = await ctx.db
      .query("members")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .unique();
    if (member) {
      await ctx.db.patch(member._id, { lastSeen: now });
    }
  },
});

export const leave = mutation({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    const member = await ctx.db
      .query("members")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .unique();
    if (member) await ctx.db.delete(member._id);

    // Release any floor this session holds (I4).
    const floors = await ctx.db.query("floor").collect();
    for (const f of floors) {
      if (f.sessionId === sessionId) await ctx.db.delete(f._id);
    }

    // Drop undelivered signals addressed to or from this session.
    const inbox = await ctx.db
      .query("signals")
      .withIndex("by_recipient", (q) => q.eq("toSession", sessionId))
      .collect();
    for (const s of inbox) await ctx.db.delete(s._id);
  },
});

export const roster = query({
  args: { channel: v.string(), accessCode: v.optional(v.string()) },
  handler: async (ctx, { channel, accessCode }) => {
    assertCode(accessCode);
    const cutoff = Date.now() - FRESH_MS;
    const members = await ctx.db
      .query("members")
      .withIndex("by_channel", (q) => q.eq("channel", channel))
      .collect();
    return members
      .filter((m) => m.lastSeen > cutoff)
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((m) => ({
        sessionId: m.sessionId,
        name: m.name,
        joinedAt: m.joinedAt,
        userId: m.userId,
      }));
  },
});
