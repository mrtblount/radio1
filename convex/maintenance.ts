import { internalMutation, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { FRESH_MS } from "./presence";

const SIGNAL_TTL_MS = 60_000;

/** Ephemeral (e2e) users outlive their run by this much, then sweep (D22). */
const EPHEMERAL_TTL_MS = 60 * 60_000;

// Sweep expired floor holds so a dead client can never hold a channel (I4).
export const sweepFloor = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const floors = await ctx.db
      .query("floor")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", now))
      .collect();
    for (const f of floors) await ctx.db.delete(f._id);
  },
});

// Sweep stale members (deletion pushes reactive roster updates, I5) and dead signals.
export const sweepStale = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const staleMembers = await ctx.db
      .query("members")
      .withIndex("by_lastSeen", (q) => q.lt("lastSeen", now - FRESH_MS))
      .collect();
    for (const m of staleMembers) await ctx.db.delete(m._id);

    const oldSignals = await ctx.db
      .query("signals")
      .withIndex("by_createdAt", (q) => q.lt("createdAt", now - SIGNAL_TTL_MS))
      .collect();
    for (const s of oldSignals) await ctx.db.delete(s._id);

    // Spent typing beacons (clients ignore them past `until`; this is hygiene).
    const beacons = await ctx.db.query("typing").collect();
    for (const b of beacons) {
      if (b.until < now - 10_000) await ctx.db.delete(b._id);
    }

    // Unanswered direct-call rings.
    const rings = await ctx.db
      .query("directCalls")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", now))
      .collect();
    for (const r of rings) await ctx.db.delete(r._id);
  },
});

/**
 * Delete one user and their durable footprint (D22): authored messages,
 * transmissions (with storage blobs), reads, pushSubs, aiMessages, typing,
 * channels they created, and DM channels they belong to (with those channels'
 * content). Other users' reads rows pointing at deleted channels are left —
 * tiny and harmless. Table scans here are fine: this only runs against test
 * debris on small tables.
 */
async function purgeUserCascade(ctx: MutationCtx, user: Doc<"users">) {
  const uid = user.userId;

  const channels = await ctx.db.query("channels").collect();
  const doomed = channels.filter(
    (c) =>
      (c.kind === "team" && c.createdBy === uid) ||
      (c.kind === "dm" && !!c.dmMembers?.includes(uid)),
  );
  for (const c of doomed) {
    const msgs = await ctx.db
      .query("messages")
      .withIndex("by_channel", (q) => q.eq("channelKey", c.key))
      .collect();
    for (const m of msgs) await ctx.db.delete(m._id);
    const clips = await ctx.db
      .query("transmissions")
      .withIndex("by_channel", (q) => q.eq("channelKey", c.key))
      .collect();
    for (const t of clips) {
      try {
        await ctx.storage.delete(t.storageId);
      } catch {
        // blob already gone — the row still goes
      }
      await ctx.db.delete(t._id);
    }
    await ctx.db.delete(c._id);
  }

  const messages = await ctx.db.query("messages").collect();
  for (const m of messages) {
    if (m.userId === uid) await ctx.db.delete(m._id);
  }
  const transmissions = await ctx.db.query("transmissions").collect();
  for (const t of transmissions) {
    if (t.userId !== uid) continue;
    try {
      await ctx.storage.delete(t.storageId);
    } catch {
      // blob already gone
    }
    await ctx.db.delete(t._id);
  }
  const reads = await ctx.db
    .query("reads")
    .withIndex("by_user_channel", (q) => q.eq("userId", uid))
    .collect();
  for (const r of reads) await ctx.db.delete(r._id);
  const subs = await ctx.db
    .query("pushSubs")
    .withIndex("by_user", (q) => q.eq("userId", uid))
    .collect();
  for (const s of subs) await ctx.db.delete(s._id);
  const aiRows = await ctx.db
    .query("aiMessages")
    .withIndex("by_user", (q) => q.eq("userId", uid))
    .collect();
  for (const a of aiRows) await ctx.db.delete(a._id);
  const beacons = await ctx.db.query("typing").collect();
  for (const b of beacons) {
    if (b.userId === uid) await ctx.db.delete(b._id);
  }

  await ctx.db.delete(user._id);
}

/** Hourly: e2e identities and everything they touched disappear (D22). */
export const sweepEphemeralUsers = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - EPHEMERAL_TTL_MS;
    const users = await ctx.db.query("users").collect();
    for (const u of users) {
      if (u.ephemeral && u.lastActiveAt < cutoff) {
        await purgeUserCascade(ctx, u);
      }
    }
  },
});

/**
 * One-off cleanup for pre-existing test debris (the "44 Alphas"): explicit
 * userId list only — no fuzzy name matching. Produce the candidate list with
 * a read-only query, review it, then run this via `npx convex run`.
 */
export const purgeUsers = internalMutation({
  args: { userIds: v.array(v.string()) },
  handler: async (ctx, { userIds }) => {
    if (userIds.length === 0) return { purged: 0 };
    const wanted = new Set(userIds);
    const users = await ctx.db.query("users").collect();
    let purged = 0;
    for (const u of users) {
      if (wanted.has(u.userId)) {
        await purgeUserCascade(ctx, u);
        purged++;
      }
    }
    return { purged };
  },
});
