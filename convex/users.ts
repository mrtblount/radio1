import { mutation, query, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { checkCode, assertCode } from "./access";

/** A user counts as "in the app right now" within this window. */
export const ACTIVE_MS = 45_000;

/** A call sign stays reserved this long after its holder was last active (D22). */
export const NAME_HOLD_MS = 7 * 24 * 60 * 60_000;

/** The directory hides users inactive longer than this (SPEC I5, §9.3). */
export const DIRECTORY_MS = 30 * 24 * 60 * 60_000;

const normalizeName = (name: string) => name.trim().toLowerCase();

/** Another device actively holds this call sign (case-insensitive). */
async function nameConflict(
  ctx: QueryCtx,
  userId: string,
  name: string,
): Promise<boolean> {
  const wanted = normalizeName(name);
  const cutoff = Date.now() - NAME_HOLD_MS;
  const all = await ctx.db.query("users").collect();
  return all.some(
    (u) =>
      u.userId !== userId &&
      normalizeName(u.name) === wanted &&
      u.lastActiveAt > cutoff,
  );
}

export const upsert = mutation({
  args: {
    userId: v.string(),
    name: v.string(),
    accessCode: v.optional(v.string()),
    ephemeral: v.optional(v.boolean()),
  },
  handler: async (ctx, { userId, name, accessCode, ephemeral }) => {
    const gate = checkCode(accessCode);
    if (gate !== "ok") {
      return { ok: false as const, reason: `code-${gate}` as const };
    }
    const now = Date.now();
    const existing = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    const renaming =
      existing && normalizeName(existing.name) !== normalizeName(name);
    if ((!existing || renaming) && (await nameConflict(ctx, userId, name))) {
      return { ok: false as const, reason: "name-taken" as const };
    }
    if (existing) {
      await ctx.db.patch(existing._id, { name, lastActiveAt: now });
    } else {
      await ctx.db.insert("users", {
        userId,
        name,
        createdAt: now,
        lastActiveAt: now,
        prefs: {},
        ...(ephemeral ? { ephemeral: true } : {}),
      });
    }
    return { ok: true as const };
  },
});

/** Gate pre-check so the join screen can refuse a taken call sign up front. */
export const nameAvailable = query({
  args: {
    userId: v.string(),
    name: v.string(),
    accessCode: v.optional(v.string()),
  },
  handler: async (ctx, { userId, name, accessCode }) => {
    assertCode(accessCode);
    return !(await nameConflict(ctx, userId, name));
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
      // Durable identity is not presence: stale rows are hidden, never shown.
      .filter((u) => u.lastActiveAt > now - DIRECTORY_MS)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((u) => ({
        userId: u.userId,
        name: u.name,
        online: u.lastActiveAt > now - ACTIVE_MS,
        onRadioChannel: radioByUser.get(u.userId) ?? null,
      }));
  },
});
