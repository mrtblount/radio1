import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { v } from "convex/values";
import { assertCode, assertAdminCode } from "./access";
import { CHANNELS } from "../src/channels";

export const ANNOUNCEMENTS_KEY = "Announcements";

/** Canonical DM channel key for a user pair (order-independent). */
export function dmKey(a: string, b: string): string {
  const [x, y] = [a, b].sort();
  return `dm_${x}_${y}`;
}

/**
 * Idempotent seeding: team channels for every radio channel (key = the exact
 * v1 channel name, so floor/presence/signals keys are untouched) plus the
 * post-restricted Announcements channel.
 */
export const ensureSeeded = mutation({
  args: { accessCode: v.optional(v.string()) },
  handler: async (ctx, { accessCode }) => {
    assertCode(accessCode);
    const now = Date.now();
    const wanted: Array<{ key: string; name: string; postRestricted: boolean }> =
      [
        ...CHANNELS.map((name) => ({ key: name, name, postRestricted: false })),
        {
          key: ANNOUNCEMENTS_KEY,
          name: "Announcements",
          postRestricted: true,
        },
      ];
    for (const w of wanted) {
      const existing = await ctx.db
        .query("channels")
        .withIndex("by_key", (q) => q.eq("key", w.key))
        .unique();
      if (!existing) {
        await ctx.db.insert("channels", {
          key: w.key,
          name: w.name,
          kind: "team",
          postRestricted: w.postRestricted,
          archived: false,
          createdBy: "system",
          createdAt: now,
        });
      }
    }
  },
});

/** Unread count for one channel (cheap: only scans messages after the cursor). */
export async function unreadCount(
  ctx: QueryCtx,
  channelKey: string,
  userId: string,
): Promise<number> {
  const read = await ctx.db
    .query("reads")
    .withIndex("by_user_channel", (q) =>
      q.eq("userId", userId).eq("channelKey", channelKey),
    )
    .unique();
  const since = read?.lastReadAt ?? 0;
  const fresh = await ctx.db
    .query("messages")
    .withIndex("by_channel", (q) =>
      q.eq("channelKey", channelKey).gt("createdAt", since),
    )
    .take(100);
  return fresh.filter((m) => m.userId !== userId).length;
}

async function lastMessage(ctx: QueryCtx, channelKey: string) {
  const m = await ctx.db
    .query("messages")
    .withIndex("by_channel", (q) => q.eq("channelKey", channelKey))
    .order("desc")
    .first();
  if (!m) return null;
  return { name: m.name, body: m.body, kind: m.kind, createdAt: m.createdAt };
}

/** Everything the chat channel list needs, in one reactive query. */
export const list = query({
  args: { userId: v.string(), accessCode: v.optional(v.string()) },
  handler: async (ctx, { userId, accessCode }) => {
    assertCode(accessCode);
    const all = await ctx.db.query("channels").collect();
    const now = Date.now();

    const team = [];
    for (const c of all) {
      if (c.kind !== "team" || c.archived) continue;
      team.push({
        key: c.key,
        name: c.name,
        postRestricted: c.postRestricted,
        unread: await unreadCount(ctx, c.key, userId),
        last: await lastMessage(ctx, c.key),
      });
    }
    // Seeded order: radio channels first (constant order), then Announcements,
    // then customs by creation.
    const orderOf = (key: string) => {
      const i = (CHANNELS as readonly string[]).indexOf(key);
      if (i >= 0) return i;
      if (key === ANNOUNCEMENTS_KEY) return CHANNELS.length;
      return CHANNELS.length + 1;
    };
    team.sort((a, b) => orderOf(a.key) - orderOf(b.key));

    const users = await ctx.db.query("users").collect();
    const nameOf = new Map(users.map((u) => [u.userId, u.name]));
    const onlineOf = new Map(
      users.map((u) => [u.userId, u.lastActiveAt > now - 45_000]),
    );

    const dms = [];
    for (const c of all) {
      if (c.kind !== "dm" || !c.dmMembers?.includes(userId)) continue;
      const other = c.dmMembers.find((m) => m !== userId) ?? userId;
      dms.push({
        key: c.key,
        otherUserId: other,
        name: nameOf.get(other) ?? "Unknown",
        online: onlineOf.get(other) ?? false,
        unread: await unreadCount(ctx, c.key, userId),
        last: await lastMessage(ctx, c.key),
      });
    }
    dms.sort(
      (a, b) => (b.last?.createdAt ?? 0) - (a.last?.createdAt ?? 0),
    );

    return { team, dms };
  },
});

/** Radio channel picker: talkable team channels (not post-restricted). */
export const listForRadio = query({
  args: { accessCode: v.optional(v.string()) },
  handler: async (ctx, { accessCode }) => {
    assertCode(accessCode);
    const all = await ctx.db.query("channels").collect();
    const team = all.filter(
      (c) => c.kind === "team" && !c.archived && !c.postRestricted,
    );
    const orderOf = (key: string) => {
      const i = (CHANNELS as readonly string[]).indexOf(key);
      return i >= 0 ? i : CHANNELS.length + 1;
    };
    team.sort((a, b) => orderOf(a.key) - orderOf(b.key));
    return team.map((c) => ({ key: c.key, name: c.name }));
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    userId: v.string(),
    accessCode: v.optional(v.string()),
  },
  handler: async (ctx, { name, userId, accessCode }) => {
    assertCode(accessCode);
    const clean = name.trim().slice(0, 32);
    if (clean.length < 2) throw new Error("Channel name too short");
    let key = clean;
    for (let n = 2; ; n++) {
      const existing = await ctx.db
        .query("channels")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique();
      if (!existing) break;
      if (existing.archived && existing.kind === "team") {
        // Reviving an archived channel by name: unarchive it.
        await ctx.db.patch(existing._id, { archived: false });
        return { key: existing.key };
      }
      key = `${clean} ${n}`;
    }
    await ctx.db.insert("channels", {
      key,
      name: clean,
      kind: "team",
      postRestricted: false,
      archived: false,
      createdBy: userId,
      createdAt: Date.now(),
    });
    return { key };
  },
});

export const archive = mutation({
  args: { key: v.string(), adminCode: v.string() },
  handler: async (ctx, { key, adminCode }) => {
    assertAdminCode(adminCode);
    if (
      (CHANNELS as readonly string[]).includes(key) ||
      key === ANNOUNCEMENTS_KEY
    ) {
      throw new Error("Seeded channels can't be archived");
    }
    const channel = await ctx.db
      .query("channels")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (channel) await ctx.db.patch(channel._id, { archived: true });
  },
});

/** Find-or-create the DM channel row for a user pair; returns its key. */
export async function ensureDm(
  ctx: MutationCtx,
  userId: string,
  otherUserId: string,
): Promise<string> {
  if (userId === otherUserId) throw new Error("Can't DM yourself");
  const key = dmKey(userId, otherUserId);
  const existing = await ctx.db
    .query("channels")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (!existing) {
    await ctx.db.insert("channels", {
      key,
      name: "",
      kind: "dm",
      postRestricted: false,
      archived: false,
      dmMembers: [userId, otherUserId].sort(),
      createdBy: userId,
      createdAt: Date.now(),
    });
  }
  return key;
}

export const openDm = mutation({
  args: {
    userId: v.string(),
    otherUserId: v.string(),
    accessCode: v.optional(v.string()),
  },
  handler: async (ctx, { userId, otherUserId, accessCode }) => {
    assertCode(accessCode);
    return { key: await ensureDm(ctx, userId, otherUserId) };
  },
});
