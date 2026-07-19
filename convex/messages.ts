import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { assertCode, checkAdminCode } from "./access";
import { unreadState, visibleChannelRows } from "./channels";

const MAX_BODY = 4000;
const TYPING_MS = 4_000;

export const page = query({
  args: {
    channelKey: v.string(),
    userId: v.string(),
    paginationOpts: paginationOptsValidator,
    accessCode: v.optional(v.string()),
  },
  handler: async (ctx, { channelKey, userId, paginationOpts, accessCode }) => {
    assertCode(accessCode);
    // DMs are readable only by their two participants.
    const channel = await ctx.db
      .query("channels")
      .withIndex("by_key", (q) => q.eq("key", channelKey))
      .unique();
    if (channel?.kind === "dm" && !channel.dmMembers?.includes(userId)) {
      throw new Error("Not your conversation");
    }
    return await ctx.db
      .query("messages")
      .withIndex("by_channel", (q) => q.eq("channelKey", channelKey))
      .order("desc")
      .paginate(paginationOpts);
  },
});

export const send = mutation({
  args: {
    channelKey: v.string(),
    userId: v.string(),
    body: v.string(),
    accessCode: v.optional(v.string()),
    adminCode: v.optional(v.string()),
  },
  handler: async (ctx, { channelKey, userId, body, accessCode, adminCode }) => {
    assertCode(accessCode);
    const clean = body.trim().slice(0, MAX_BODY);
    if (!clean) return;

    const channel = await ctx.db
      .query("channels")
      .withIndex("by_key", (q) => q.eq("key", channelKey))
      .unique();
    if (!channel || channel.archived) throw new Error("No such channel");
    if (channel.kind === "dm" && !channel.dmMembers?.includes(userId)) {
      throw new Error("Not your conversation");
    }
    const isAnnouncement = channel.postRestricted;
    if (isAnnouncement && !checkAdminCode(adminCode)) {
      throw new Error("Only team leads can post here");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    const name = user?.name ?? "Unknown";
    const now = Date.now();

    const mentions = await resolveMentions(ctx, clean, userId);
    const messageId = await ctx.db.insert("messages", {
      channelKey,
      userId,
      name,
      kind: isAnnouncement ? "announce" : "text",
      body: clean,
      ...(mentions.length ? { mentions } : {}),
      createdAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.pushSend.notifyMessage, {
      messageId,
    });

    // Sender has obviously read their own message.
    await upsertRead(ctx, userId, channelKey, now);

    // Their typing beacon is spent.
    const beacons = await ctx.db
      .query("typing")
      .withIndex("by_channel", (q) => q.eq("channelKey", channelKey))
      .collect();
    for (const b of beacons) {
      if (b.userId === userId) await ctx.db.delete(b._id);
    }
  },
});

/**
 * Resolve @mentions against the team directory (D23). Case-insensitive
 * `@` + name containment; when stale duplicate rows share a name, the most
 * recently active holder wins. Names are denormalized for rendering.
 */
async function resolveMentions(
  ctx: QueryCtx,
  body: string,
  senderId: string,
): Promise<{ userId: string; name: string }[]> {
  if (!body.includes("@")) return [];
  const lower = body.toLowerCase();
  const users = await ctx.db.query("users").collect();
  const byName = new Map<string, (typeof users)[number]>();
  for (const u of users) {
    if (u.userId === senderId) continue;
    const key = u.name.trim().toLowerCase();
    if (key.length < 2 || !lower.includes(`@${key}`)) continue;
    const held = byName.get(key);
    if (!held || u.lastActiveAt > held.lastActiveAt) byName.set(key, u);
  }
  return [...byName.values()].map((u) => ({ userId: u.userId, name: u.name }));
}

async function upsertRead(
  ctx: MutationCtx,
  userId: string,
  channelKey: string,
  at: number,
) {
  const existing = await ctx.db
    .query("reads")
    .withIndex("by_user_channel", (q) =>
      q.eq("userId", userId).eq("channelKey", channelKey),
    )
    .unique();
  if (existing) {
    if (existing.lastReadAt < at) await ctx.db.patch(existing._id, { lastReadAt: at });
  } else {
    await ctx.db.insert("reads", { userId, channelKey, lastReadAt: at });
  }
}

export const markRead = mutation({
  args: {
    userId: v.string(),
    channelKey: v.string(),
    accessCode: v.optional(v.string()),
  },
  handler: async (ctx, { userId, channelKey, accessCode }) => {
    assertCode(accessCode);
    await upsertRead(ctx, userId, channelKey, Date.now());
  },
});

/**
 * Tab-badge totals across every visible channel: `total` excludes muted
 * channels; `mentions` counts every channel — a mention in a muted channel
 * still badges (amber), it just stays quiet (D23).
 */
export const unreadSummary = query({
  args: { userId: v.string(), accessCode: v.optional(v.string()) },
  handler: async (ctx, { userId, accessCode }) => {
    assertCode(accessCode);
    const rows = await visibleChannelRows(ctx, userId);
    let total = 0;
    let mentions = 0;
    for (const c of [...rows.team, ...rows.dms]) {
      const s = await unreadState(ctx, c.key, userId);
      mentions += s.mentionUnread;
      if (s.alertLevel !== "mute") total += s.unread;
    }
    return { total, mentions };
  },
});

/** Per-channel alert level: all (default) · mentions-only · mute (D23). */
export const setAlertLevel = mutation({
  args: {
    userId: v.string(),
    channelKey: v.string(),
    level: v.union(v.literal("all"), v.literal("mentions"), v.literal("mute")),
    accessCode: v.optional(v.string()),
  },
  handler: async (ctx, { userId, channelKey, level, accessCode }) => {
    assertCode(accessCode);
    const existing = await ctx.db
      .query("reads")
      .withIndex("by_user_channel", (q) =>
        q.eq("userId", userId).eq("channelKey", channelKey),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { alertLevel: level });
    } else {
      // lastReadAt 0 = identical unread semantics to having no row.
      await ctx.db.insert("reads", {
        userId,
        channelKey,
        lastReadAt: 0,
        alertLevel: level,
      });
    }
  },
});

export const setTyping = mutation({
  args: {
    channelKey: v.string(),
    userId: v.string(),
    accessCode: v.optional(v.string()),
  },
  handler: async (ctx, { channelKey, userId, accessCode }) => {
    assertCode(accessCode);
    const user = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!user) return;
    const until = Date.now() + TYPING_MS;
    const rows = await ctx.db
      .query("typing")
      .withIndex("by_channel", (q) => q.eq("channelKey", channelKey))
      .collect();
    const mine = rows.find((r) => r.userId === userId);
    if (mine) {
      await ctx.db.patch(mine._id, { until });
    } else {
      await ctx.db.insert("typing", {
        channelKey,
        userId,
        name: user.name,
        until,
      });
    }
  },
});

export const typers = query({
  args: {
    channelKey: v.string(),
    userId: v.string(),
    accessCode: v.optional(v.string()),
  },
  handler: async (ctx, { channelKey, userId, accessCode }) => {
    assertCode(accessCode);
    const rows = await ctx.db
      .query("typing")
      .withIndex("by_channel", (q) => q.eq("channelKey", channelKey))
      .collect();
    // Client re-checks `until` on render; stale rows are swept by cron.
    return rows
      .filter((r) => r.userId !== userId)
      .map((r) => ({ name: r.name, until: r.until }));
  },
});
