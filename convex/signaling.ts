import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { assertCode } from "./access";

const kindValidator = v.union(
  v.literal("offer"),
  v.literal("answer"),
  v.literal("ice"),
);

export const send = mutation({
  args: {
    fromSession: v.string(),
    toSession: v.string(),
    channel: v.string(),
    kind: kindValidator,
    payload: v.string(),
    accessCode: v.optional(v.string()),
  },
  handler: async (ctx, { accessCode, ...args }) => {
    assertCode(accessCode);
    await ctx.db.insert("signals", { ...args, createdAt: Date.now() });
  },
});

export const inbox = query({
  args: { toSession: v.string(), accessCode: v.optional(v.string()) },
  handler: async (ctx, { toSession, accessCode }) => {
    assertCode(accessCode);
    const rows = await ctx.db
      .query("signals")
      .withIndex("by_recipient", (q) => q.eq("toSession", toSession))
      .collect();
    return rows
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((s) => ({
        id: s._id,
        fromSession: s.fromSession,
        channel: s.channel,
        kind: s.kind,
        payload: s.payload,
      }));
  },
});

export const consume = mutation({
  args: {
    ids: v.array(v.id("signals")),
    accessCode: v.optional(v.string()),
  },
  handler: async (ctx, { ids, accessCode }) => {
    assertCode(accessCode);
    for (const id of ids) {
      const row = await ctx.db.get(id);
      if (row) await ctx.db.delete(id);
    }
  },
});
