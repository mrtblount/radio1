import {
  internalMutation,
  internalQuery,
  mutation,
} from "./_generated/server";
import { v } from "convex/values";
import { assertCode } from "./access";
import { ACTIVE_MS } from "./users";

export const subscribe = mutation({
  args: {
    userId: v.string(),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    ua: v.string(),
    accessCode: v.optional(v.string()),
  },
  handler: async (ctx, { accessCode, ...sub }) => {
    assertCode(accessCode);
    const existing = await ctx.db
      .query("pushSubs")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", sub.endpoint))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { ...sub });
    } else {
      await ctx.db.insert("pushSubs", { ...sub, createdAt: Date.now() });
    }
    const user = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", sub.userId))
      .unique();
    if (user) {
      await ctx.db.patch(user._id, {
        prefs: { ...user.prefs, notifyEnabled: true },
      });
    }
  },
});

export const unsubscribe = mutation({
  args: {
    userId: v.string(),
    endpoint: v.optional(v.string()),
    accessCode: v.optional(v.string()),
  },
  handler: async (ctx, { userId, endpoint, accessCode }) => {
    assertCode(accessCode);
    const subs = await ctx.db
      .query("pushSubs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const s of subs) {
      if (!endpoint || s.endpoint === endpoint) await ctx.db.delete(s._id);
    }
    const user = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (user) {
      await ctx.db.patch(user._id, {
        prefs: { ...user.prefs, notifyEnabled: false },
      });
    }
  },
});

/** Recipients for a chat message per PLAN D13. */
export const messageRecipients = internalQuery({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }) => {
    const message = await ctx.db.get(messageId);
    if (!message) return null;
    const channel = await ctx.db
      .query("channels")
      .withIndex("by_key", (q) => q.eq("key", message.channelKey))
      .unique();
    if (!channel) return null;

    const now = Date.now();
    const users = await ctx.db.query("users").collect();
    const isDm = channel.kind === "dm";
    const always = isDm || message.kind === "announce";

    const userIds = users
      .filter((u) => u.userId !== message.userId)
      .filter((u) => !isDm || channel.dmMembers?.includes(u.userId))
      // Team-channel chatter doesn't ping people who are looking at the app.
      .filter((u) => always || u.lastActiveAt < now - ACTIVE_MS)
      .map((u) => u.userId);

    const subs = [];
    for (const uid of userIds) {
      const rows = await ctx.db
        .query("pushSubs")
        .withIndex("by_user", (q) => q.eq("userId", uid))
        .collect();
      subs.push(...rows);
    }

    const senderName = message.name;
    const channelLabel = isDm ? senderName : channel.name;
    return {
      subs: subs.map((s) => ({
        id: s._id,
        endpoint: s.endpoint,
        p256dh: s.p256dh,
        auth: s.auth,
      })),
      payload: {
        title: isDm
          ? `${senderName} (direct)`
          : message.kind === "announce"
            ? `Announcement · ${channelLabel}`
            : `${senderName} · ${channelLabel}`,
        body:
          message.kind === "clip"
            ? "Missed transmission — tap to listen"
            : message.body.slice(0, 140),
        tag: message.channelKey,
        url: `/#chat/${encodeURIComponent(message.channelKey)}`,
      },
    };
  },
});

/** Recipients for a finished transmission: members NOT hearing it live. */
export const clipRecipients = internalQuery({
  args: { transmissionId: v.id("transmissions") },
  handler: async (ctx, { transmissionId }) => {
    const clip = await ctx.db.get(transmissionId);
    if (!clip) return null;
    const channel = await ctx.db
      .query("channels")
      .withIndex("by_key", (q) => q.eq("key", clip.channelKey))
      .unique();

    const now = Date.now();
    const users = await ctx.db.query("users").collect();
    const presence = await ctx.db
      .query("members")
      .withIndex("by_channel", (q) => q.eq("channel", clip.channelKey))
      .collect();
    const liveListeners = new Set(
      presence.filter((m) => m.lastSeen > now - 30_000).map((m) => m.userId),
    );
    const isDm = channel?.kind === "dm";

    const userIds = users
      .filter((u) => u.userId !== clip.userId)
      .filter((u) => !isDm || channel?.dmMembers?.includes(u.userId))
      .filter((u) => !liveListeners.has(u.userId))
      .map((u) => u.userId);

    const subs = [];
    for (const uid of userIds) {
      const rows = await ctx.db
        .query("pushSubs")
        .withIndex("by_user", (q) => q.eq("userId", uid))
        .collect();
      subs.push(...rows);
    }

    return {
      subs: subs.map((s) => ({
        id: s._id,
        endpoint: s.endpoint,
        p256dh: s.p256dh,
        auth: s.auth,
      })),
      payload: {
        title: isDm
          ? `${clip.name} (direct radio)`
          : `${clip.name} · ${channel?.name ?? clip.channelKey}`,
        body: "Missed transmission — tap to listen",
        tag: clip.channelKey,
        url: `/#chat/${encodeURIComponent(clip.channelKey)}`,
      },
    };
  },
});

/** Dead-endpoint cleanup, driven by the send action (404/410 responses). */
export const prune = internalMutation({
  args: { ids: v.array(v.id("pushSubs")) },
  handler: async (ctx, { ids }) => {
    for (const id of ids) {
      const row = await ctx.db.get(id);
      if (row) await ctx.db.delete(row._id);
    }
  },
});
