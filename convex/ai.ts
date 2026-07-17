import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { assertCode } from "./access";
import { ACTIVE_MS } from "./users";
import { unreadCount } from "./channels";
import { todayKey } from "./tasks";

const THREAD_LIMIT = 60;

export const thread = query({
  args: { userId: v.string(), accessCode: v.optional(v.string()) },
  handler: async (ctx, { userId, accessCode }) => {
    assertCode(accessCode);
    const rows = await ctx.db
      .query("aiMessages")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(THREAD_LIMIT);
    return rows.reverse().map((m) => ({
      id: m._id,
      role: m.role,
      text: m.text,
      blocksJson: m.blocksJson ?? null,
      status: m.status,
      createdAt: m.createdAt,
    }));
  },
});

export const ask = mutation({
  args: {
    userId: v.string(),
    text: v.string(),
    accessCode: v.optional(v.string()),
  },
  handler: async (ctx, { userId, text, accessCode }) => {
    assertCode(accessCode);
    const settings = await ctx.db.query("settings").first();
    if (settings && !settings.aiEnabled) throw new Error("AI is disabled");
    const clean = text.trim().slice(0, 2000);
    if (!clean) return;
    const now = Date.now();
    await ctx.db.insert("aiMessages", {
      userId,
      role: "user",
      text: clean,
      status: "done",
      createdAt: now,
    });
    const placeholderId = await ctx.db.insert("aiMessages", {
      userId,
      role: "assistant",
      text: "Thinking…",
      status: "thinking",
      createdAt: now + 1,
    });
    await ctx.scheduler.runAfter(0, internal.aiAgent.run, {
      userId,
      placeholderId,
    });
  },
});

/** The three dashboard cards, in one reactive query. */
export const dashboard = query({
  args: { userId: v.string(), accessCode: v.optional(v.string()) },
  handler: async (ctx, { userId, accessCode }) => {
    assertCode(accessCode);
    const now = Date.now();

    const presence = await ctx.db.query("members").collect();
    const onDuty = new Set(
      presence
        .filter((m) => m.lastSeen > now - 30_000)
        .map((m) => m.userId ?? m.sessionId),
    ).size;

    // Missed = unread clips across my channels.
    const channels = await ctx.db.query("channels").collect();
    let missed = 0;
    for (const c of channels) {
      if (c.archived) continue;
      if (c.kind === "dm" && !c.dmMembers?.includes(userId)) continue;
      const read = await ctx.db
        .query("reads")
        .withIndex("by_user_channel", (q) =>
          q.eq("userId", userId).eq("channelKey", c.key),
        )
        .unique();
      const since = read?.lastReadAt ?? 0;
      const fresh = await ctx.db
        .query("messages")
        .withIndex("by_channel", (q) =>
          q.eq("channelKey", c.key).gt("createdAt", since),
        )
        .take(100);
      missed += fresh.filter(
        (m) => m.kind === "clip" && m.userId !== userId,
      ).length;
    }

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_date", (q) => q.eq("date", todayKey()))
      .collect();

    return {
      onDuty,
      missed,
      tasksDone: tasks.filter((t) => t.done).length,
      tasksTotal: tasks.length,
    };
  },
});

// ── Agent internals ────────────────────────────────────────────────────────

export const getRun = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    const settings = await ctx.db.query("settings").first();
    const history = await ctx.db
      .query("aiMessages")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(16);
    return {
      userName: user?.name ?? "Unknown",
      orgName: settings?.orgName,
      history: history
        .reverse()
        .filter((m) => m.status === "done")
        .map((m) => ({ role: m.role, text: m.text })),
    };
  },
});

export const patchAssistant = internalMutation({
  args: {
    id: v.id("aiMessages"),
    text: v.optional(v.string()),
    blocksJson: v.optional(v.string()),
    status: v.optional(
      v.union(v.literal("thinking"), v.literal("done"), v.literal("error")),
    ),
  },
  handler: async (ctx, { id, ...patch }) => {
    const row = await ctx.db.get(id);
    if (row) await ctx.db.patch(id, patch);
  },
});

export const ctxRoster = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const users = await ctx.db.query("users").collect();
    const presence = await ctx.db.query("members").collect();
    const onAir = new Map(
      presence
        .filter((m) => m.lastSeen > now - 30_000)
        .map((m) => [m.userId ?? m.sessionId, m.channel]),
    );
    return users.map((u) => ({
      name: u.name,
      online: u.lastActiveAt > now - ACTIVE_MS,
      onRadioChannel: onAir.get(u.userId) ?? null,
      lastActiveMinsAgo: Math.round((now - u.lastActiveAt) / 60_000),
    }));
  },
});

export const ctxTransmissions = internalQuery({
  args: { hours: v.number(), channel: v.optional(v.string()) },
  handler: async (ctx, { hours, channel }) => {
    const since = Date.now() - hours * 3600_000;
    const all = await ctx.db.query("transmissions").order("desc").take(200);
    return all
      .filter((t) => t.startedAt > since)
      .filter((t) => !channel || t.channelKey === channel)
      .slice(0, 60)
      .map((t) => ({
        channel: t.channelKey,
        by: t.name,
        at: new Date(t.startedAt).toISOString(),
        seconds: Math.round(t.durationMs / 1000),
        transcript:
          t.transcriptStatus === "done"
            ? t.transcript
            : `(${t.transcriptStatus})`,
      }));
  },
});

export const ctxChatActivity = internalQuery({
  args: { hours: v.number(), userId: v.string() },
  handler: async (ctx, { hours, userId }) => {
    const since = Date.now() - hours * 3600_000;
    const channels = await ctx.db.query("channels").collect();
    const out = [];
    for (const c of channels) {
      if (c.archived) continue;
      if (c.kind === "dm" && !c.dmMembers?.includes(userId)) continue;
      const recent = await ctx.db
        .query("messages")
        .withIndex("by_channel", (q) =>
          q.eq("channelKey", c.key).gt("createdAt", since),
        )
        .take(50);
      if (recent.length === 0) continue;
      out.push({
        channel: c.kind === "dm" ? "(direct message)" : c.key,
        messages: recent.length,
        unreadForMe: await unreadCount(ctx, c.key, userId),
        latest: recent.slice(-8).map((m) => ({
          by: m.name,
          kind: m.kind,
          text: m.kind === "clip" ? "(radio transmission)" : m.body.slice(0, 160),
        })),
      });
    }
    return out;
  },
});

export const ctxTasks = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("tasks")
      .withIndex("by_date", (q) => q.eq("date", todayKey()))
      .collect();
    return rows
      .sort((a, b) => a.order - b.order)
      .map((t) => ({
        label: t.label,
        done: t.done,
        doneBy: t.doneByName ?? null,
      }));
  },
});
