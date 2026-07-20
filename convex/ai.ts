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
import { unreadState, visibleChannelRows } from "./channels";
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

    // Missed = unread clips across my channels (muted channels stay quiet).
    const rows = await visibleChannelRows(ctx, userId);
    let missed = 0;
    for (const c of [...rows.team, ...rows.dms]) {
      const read = await ctx.db
        .query("reads")
        .withIndex("by_user_channel", (q) =>
          q.eq("userId", userId).eq("channelKey", c.key),
        )
        .unique();
      if (read?.alertLevel === "mute") continue;
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

/** Serialize a transcript for the agent: truncated, confidence-marked. */
function agentTranscript(t: {
  transcript?: string;
  transcriptStatus: string;
  transcriptConfidence?: "ok" | "low";
}): string {
  if (t.transcriptStatus !== "done") return `(${t.transcriptStatus})`;
  const text = (t.transcript ?? "").slice(0, 300);
  return t.transcriptConfidence === "low" ? `${text} (low confidence)` : text;
}

export const ctxTransmissions = internalQuery({
  args: {
    hours: v.number(),
    userId: v.string(),
    channel: v.optional(v.string()),
  },
  handler: async (ctx, { hours, userId, channel }) => {
    const since = Date.now() - hours * 3600_000;
    // The agent must not read other people's direct-line transmissions.
    const rows = await visibleChannelRows(ctx, userId);
    const visible = new Set([...rows.team, ...rows.dms].map((c) => c.key));
    const all = await ctx.db.query("transmissions").order("desc").take(200);
    return all
      .filter((t) => t.startedAt > since)
      .filter((t) => visible.has(t.channelKey))
      .filter((t) => !channel || t.channelKey === channel)
      .slice(0, 60)
      .map((t) => ({
        channel: t.channelKey,
        by: t.name,
        at: new Date(t.startedAt).toISOString(),
        seconds: Math.round(t.durationMs / 1000),
        transcript: agentTranscript(t),
      }));
  },
});

/**
 * Full-text search over transmission transcripts (D20) — the "what did X say
 * about Y" memory. Same visibility contract as ctxTransmissions.
 */
export const ctxSearchTransmissions = internalQuery({
  args: {
    userId: v.string(),
    query: v.string(),
    channel: v.optional(v.string()),
    hours: v.optional(v.number()),
  },
  handler: async (ctx, { userId, query: text, channel, hours }) => {
    const since = hours ? Date.now() - hours * 3600_000 : 0;
    const rows = await visibleChannelRows(ctx, userId);
    const visible = new Set([...rows.team, ...rows.dms].map((c) => c.key));
    const hits = await ctx.db
      .query("transmissions")
      .withSearchIndex("search_transcript", (s) => {
        const w = s.search("transcript", text);
        return channel ? w.eq("channelKey", channel) : w;
      })
      .take(30);
    return hits
      .filter((t) => visible.has(t.channelKey))
      .filter((t) => t.startedAt > since)
      .slice(0, 20)
      .map((t) => ({
        channel: t.channelKey,
        by: t.name,
        at: new Date(t.startedAt).toISOString(),
        seconds: Math.round(t.durationMs / 1000),
        transcript: agentTranscript(t),
      }));
  },
});

/**
 * The same channel enumeration the UI renders (D21): every live team channel
 * (quiet ones included) + the asker's own DMs.
 */
export const ctxChannels = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const rows = await visibleChannelRows(ctx, userId);
    const users = await ctx.db.query("users").collect();
    const nameOf = new Map(users.map((u) => [u.userId, u.name]));
    return {
      teamChannelCount: rows.team.length,
      teamChannels: rows.team.map((c) => ({
        name: c.key,
        kind: c.postRestricted ? "announcements" : "team",
      })),
      directMessages: rows.dms.map((c) => ({
        with: nameOf.get(c.dmMembers?.find((m) => m !== userId) ?? "") ??
          "Unknown",
      })),
      note:
        "teamChannels excludes archived channels; directMessages are only the asker's own.",
    };
  },
});

export const ctxChatActivity = internalQuery({
  args: { hours: v.number(), userId: v.string() },
  handler: async (ctx, { hours, userId }) => {
    const since = Date.now() - hours * 3600_000;
    const rows = await visibleChannelRows(ctx, userId);
    const out = [];
    for (const c of [...rows.team, ...rows.dms]) {
      const recent = await ctx.db
        .query("messages")
        .withIndex("by_channel", (q) =>
          q.eq("channelKey", c.key).gt("createdAt", since),
        )
        .take(50);
      // Quiet channels are reported with zero counts, never dropped — the
      // agent's channel view must match the UI's (D21, SPEC §9 P3).
      out.push({
        channel: c.kind === "dm" ? "(direct message)" : c.key,
        messages: recent.length,
        unreadForMe: (await unreadState(ctx, c.key, userId)).unread,
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
