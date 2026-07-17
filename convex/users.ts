import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { checkCode, assertCode } from "./access";

/** A user counts as "in the app right now" within this window. */
export const ACTIVE_MS = 45_000;

export const upsert = mutation({
  args: {
    userId: v.string(),
    name: v.string(),
    accessCode: v.optional(v.string()),
  },
  handler: async (ctx, { userId, name, accessCode }) => {
    const gate = checkCode(accessCode);
    if (gate !== "ok") {
      return { ok: false as const, reason: `code-${gate}` as const };
    }
    const now = Date.now();
    const existing = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { name, lastActiveAt: now });
    } else {
      await ctx.db.insert("users", {
        userId,
        name,
        createdAt: now,
        lastActiveAt: now,
        prefs: {},
      });
    }
    return { ok: true as const };
  },
});

export const heartbeat = mutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (user) await ctx.db.patch(user._id, { lastActiveAt: Date.now() });
  },
});

export const setPrefs = mutation({
  args: {
    userId: v.string(),
    prefs: v.object({
      dashOpen: v.optional(v.boolean()),
      notifyEnabled: v.optional(v.boolean()),
    }),
  },
  handler: async (ctx, { userId, prefs }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (user) await ctx.db.patch(user._id, { prefs: { ...user.prefs, ...prefs } });
  },
});

export const me = query({
  args: { userId: v.string(), accessCode: v.optional(v.string()) },
  handler: async (ctx, { userId, accessCode }) => {
    assertCode(accessCode);
    const user = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!user) return null;
    return { userId: user.userId, name: user.name, prefs: user.prefs };
  },
});

/** Team directory with liveness: online = app open recently; onRadio = channel. */
export const list = query({
  args: { accessCode: v.optional(v.string()) },
  handler: async (ctx, { accessCode }) => {
    assertCode(accessCode);
    const now = Date.now();
    const users = await ctx.db.query("users").collect();
    const presence = await ctx.db.query("members").collect();
    const radioByUser = new Map<string, string>();
    for (const m of presence) {
      if (m.userId && m.lastSeen > now - 30_000) {
        radioByUser.set(m.userId, m.channel);
      }
    }
    return users
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((u) => ({
        userId: u.userId,
        name: u.name,
        online: u.lastActiveAt > now - ACTIVE_MS,
        onRadioChannel: radioByUser.get(u.userId) ?? null,
      }));
  },
});
