import { internalMutation } from "./_generated/server";
import { FRESH_MS } from "./presence";

const SIGNAL_TTL_MS = 60_000;

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
  },
});
