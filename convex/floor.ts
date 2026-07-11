import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { assertCode } from "./access";

// Talker must renew within this window or the floor auto-releases (I4).
const HOLD_MS = 10_000;
// Hard cap on a single transmission (radio discipline).
const MAX_TRANSMISSION_MS = 60_000;

export const acquire = mutation({
  args: {
    sessionId: v.string(),
    name: v.string(),
    channel: v.string(),
    accessCode: v.optional(v.string()),
  },
  handler: async (ctx, { sessionId, name, channel, accessCode }) => {
    assertCode(accessCode);
    const now = Date.now();
    const current = await ctx.db
      .query("floor")
      .withIndex("by_channel", (q) => q.eq("channel", channel))
      .unique();

    if (current) {
      if (current.expiresAt > now && current.sessionId !== sessionId) {
        return { granted: false, holder: current.name };
      }
      // Expired hold, or re-acquire by same session: replace it.
      await ctx.db.delete(current._id);
    }

    await ctx.db.insert("floor", {
      channel,
      sessionId,
      name,
      since: now,
      expiresAt: now + HOLD_MS,
    });
    return { granted: true, holder: name };
  },
});

export const renew = mutation({
  args: {
    sessionId: v.string(),
    channel: v.string(),
    accessCode: v.optional(v.string()),
  },
  handler: async (ctx, { sessionId, channel, accessCode }) => {
    assertCode(accessCode);
    const now = Date.now();
    const current = await ctx.db
      .query("floor")
      .withIndex("by_channel", (q) => q.eq("channel", channel))
      .unique();
    if (!current || current.sessionId !== sessionId) return { held: false };
    if (now - current.since > MAX_TRANSMISSION_MS) {
      await ctx.db.delete(current._id);
      return { held: false };
    }
    await ctx.db.patch(current._id, { expiresAt: now + HOLD_MS });
    return { held: true };
  },
});

export const release = mutation({
  args: {
    sessionId: v.string(),
    channel: v.string(),
    accessCode: v.optional(v.string()),
  },
  handler: async (ctx, { sessionId, channel, accessCode }) => {
    assertCode(accessCode);
    const current = await ctx.db
      .query("floor")
      .withIndex("by_channel", (q) => q.eq("channel", channel))
      .unique();
    // Only the holder can release their own floor (I2 stays client-side; this is server hygiene).
    if (current && current.sessionId === sessionId) {
      await ctx.db.delete(current._id);
    }
  },
});

export const current = query({
  args: { channel: v.string(), accessCode: v.optional(v.string()) },
  handler: async (ctx, { channel, accessCode }) => {
    assertCode(accessCode);
    const now = Date.now();
    const f = await ctx.db
      .query("floor")
      .withIndex("by_channel", (q) => q.eq("channel", channel))
      .unique();
    if (!f || f.expiresAt <= now) return null;
    return { sessionId: f.sessionId, name: f.name, since: f.since };
  },
});
