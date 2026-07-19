import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { assertCode } from "./access";
import { ensureDm } from "./channels";

/** A ring is answerable for this long; then it's just a missed clip. */
const RING_MS = 30_000;

/**
 * Start a direct PTT call: ensure the DM channel exists and ring the other
 * side (their radio auto-switches if they're on the air; otherwise the
 * transmission lands as a clip + push like any missed traffic).
 */
export const openDirect = mutation({
  args: {
    userId: v.string(),
    otherUserId: v.string(),
    accessCode: v.optional(v.string()),
  },
  handler: async (ctx, { userId, otherUserId, accessCode }) => {
    assertCode(accessCode);
    const key = await ensureDm(ctx, userId, otherUserId);
    const me = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    const now = Date.now();
    // One live ring per callee from this caller — refresh, don't stack.
    const existing = await ctx.db
      .query("directCalls")
      .withIndex("by_to", (q) => q.eq("toUserId", otherUserId))
      .collect();
    for (const call of existing) {
      if (call.fromUserId === userId) await ctx.db.delete(call._id);
    }
    await ctx.db.insert("directCalls", {
      channelKey: key,
      fromUserId: userId,
      fromName: me?.name ?? "Unknown",
      toUserId: otherUserId,
      createdAt: now,
      expiresAt: now + RING_MS,
    });
    return { key };
  },
});

/** The callee's reactive ring subscription. */
export const incoming = query({
  args: { toUserId: v.string(), accessCode: v.optional(v.string()) },
  handler: async (ctx, { toUserId, accessCode }) => {
    assertCode(accessCode);
    const now = Date.now();
    const rows = await ctx.db
      .query("directCalls")
      .withIndex("by_to", (q) => q.eq("toUserId", toUserId))
      .collect();
    return rows
      .filter((r) => r.expiresAt > now)
      .map((r) => ({
        id: r._id,
        channelKey: r.channelKey,
        fromUserId: r.fromUserId,
        fromName: r.fromName,
      }));
  },
});

/** Consume a ring (answered, or seen-and-declined by an off-radio client). */
export const consume = mutation({
  args: { id: v.id("directCalls"), accessCode: v.optional(v.string()) },
  handler: async (ctx, { id, accessCode }) => {
    assertCode(accessCode);
    const row = await ctx.db.get(id);
    if (row) await ctx.db.delete(row._id);
  },
});
