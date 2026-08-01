// ═══════════════════════════════════════════════════════════════════════
// Channel agents (v3) — AI members of team channels, Buzz-style.
// ═══════════════════════════════════════════════════════════════════════
// ADDITIVE: new file, the only writer of the `agents` table. Agents post
// through an internal mutation into the normal `messages` stream, so every
// existing surface (history, unread, push, previews) works unchanged.
//
// Trigger paths (both fan in through `maybeTrigger`):
//   voice — transmissions.setTranscript hooks in when a transcript lands
//   text  — messages.send hooks in after a human message inserts
// Loop guard: agent-authored messages never trigger agents.

import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { assertCode } from "./access";

const MAX_AGENTS = 12;

function randomId(): string {
  return `agent_${Math.random().toString(36).slice(2, 10)}`;
}

// ── CRUD ────────────────────────────────────────────────────────────────

export const list = query({
  args: { accessCode: v.optional(v.string()) },
  handler: async (ctx, { accessCode }) => {
    assertCode(accessCode);
    const rows = await ctx.db.query("agents").collect();
    return rows
      .filter((a) => a.active)
      .map((a) => ({
        agentId: a.agentId,
        name: a.name,
        instructions: a.instructions,
        channelKeys: a.channelKeys,
        listenMode: a.listenMode,
      }));
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    instructions: v.string(),
    listenMode: v.union(v.literal("mention"), v.literal("all")),
    channelKey: v.optional(v.string()), // join this channel right away
    userId: v.string(),
    accessCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertCode(args.accessCode);
    const name = args.name.trim().slice(0, 24);
    if (name.length < 2) throw new Error("Agent needs a name.");
    const all = await ctx.db.query("agents").collect();
    if (all.filter((a) => a.active).length >= MAX_AGENTS) {
      throw new Error("Agent limit reached.");
    }
    if (all.some((a) => a.active && a.name.toLowerCase() === name.toLowerCase())) {
      throw new Error("An agent with that name already exists.");
    }
    const agentId = randomId();
    await ctx.db.insert("agents", {
      agentId,
      name,
      instructions: args.instructions.trim().slice(0, 2000),
      channelKeys: args.channelKey ? [args.channelKey] : [],
      listenMode: args.listenMode,
      active: true,
      createdBy: args.userId,
      createdAt: Date.now(),
    });
    return { agentId };
  },
});

export const update = mutation({
  args: {
    agentId: v.string(),
    name: v.optional(v.string()),
    instructions: v.optional(v.string()),
    listenMode: v.optional(v.union(v.literal("mention"), v.literal("all"))),
    active: v.optional(v.boolean()),
    accessCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertCode(args.accessCode);
    const row = await ctx.db
      .query("agents")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .first();
    if (!row) throw new Error("No such agent.");
    const patch: Record<string, unknown> = {};
    if (args.name !== undefined && args.name.trim().length >= 2) {
      patch.name = args.name.trim().slice(0, 24);
    }
    if (args.instructions !== undefined) {
      patch.instructions = args.instructions.trim().slice(0, 2000);
    }
    if (args.listenMode !== undefined) patch.listenMode = args.listenMode;
    if (args.active !== undefined) patch.active = args.active;
    await ctx.db.patch(row._id, patch);
  },
});

/** Add/remove an agent from one channel (the member-sheet toggle). */
export const setMembership = mutation({
  args: {
    agentId: v.string(),
    channelKey: v.string(),
    member: v.boolean(),
    accessCode: v.optional(v.string()),
  },
  handler: async (ctx, { agentId, channelKey, member, accessCode }) => {
    assertCode(accessCode);
    const row = await ctx.db
      .query("agents")
      .withIndex("by_agentId", (q) => q.eq("agentId", agentId))
      .first();
    if (!row) throw new Error("No such agent.");
    const keys = new Set(row.channelKeys);
    if (member) keys.add(channelKey);
    else keys.delete(channelKey);
    await ctx.db.patch(row._id, { channelKeys: [...keys] });
  },
});

// ── Trigger fan-in ──────────────────────────────────────────────────────

export const agentsForChannel = internalQuery({
  args: { channelKey: v.string() },
  handler: async (ctx, { channelKey }) => {
    const rows = await ctx.db.query("agents").collect();
    return rows.filter((a) => a.active && a.channelKeys.includes(channelKey));
  },
});

/**
 * Decide which agents (if any) should answer this utterance and schedule
 * their responses. `speakerId` guards the loop: agents never trigger agents.
 */
export const maybeTrigger = internalMutation({
  args: {
    channelKey: v.string(),
    text: v.string(),
    speakerId: v.string(),
    speakerName: v.string(),
    /** "voice" (transcribed transmission) or "text" (chat message). */
    source: v.union(v.literal("voice"), v.literal("text")),
  },
  handler: async (ctx, { channelKey, text, speakerId, speakerName, source }) => {
    if (speakerId.startsWith("agent_")) return; // loop guard
    const clean = text.trim();
    if (!clean) return;
    const agents = await ctx.runQuery(internal.agents.agentsForChannel, {
      channelKey,
    });
    for (const agent of agents) {
      const named = clean.toLowerCase().includes(agent.name.toLowerCase());
      if (agent.listenMode === "mention" && !named) continue;
      await ctx.scheduler.runAfter(0, internal.agentRespond.run, {
        agentId: agent.agentId,
        channelKey,
        trigger: clean,
        speakerName,
        source,
        addressed: named,
      });
    }
  },
});

// ── Posting (the responder's write path) ────────────────────────────────

export const post = internalMutation({
  args: {
    agentId: v.string(),
    channelKey: v.string(),
    body: v.string(),
  },
  handler: async (ctx, { agentId, channelKey, body }) => {
    const row = await ctx.db
      .query("agents")
      .withIndex("by_agentId", (q) => q.eq("agentId", agentId))
      .first();
    if (!row || !row.active) return;
    const clean = body.trim().slice(0, 1200);
    if (!clean) return;
    await ctx.db.insert("messages", {
      channelKey,
      userId: agentId,
      name: row.name,
      kind: "text",
      body: clean,
      createdAt: Date.now(),
    });
  },
});

/** Recent channel context for the responder (last N entries, oldest first). */
export const recentContext = internalQuery({
  args: { channelKey: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { channelKey, limit }) => {
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_channel", (q) => q.eq("channelKey", channelKey))
      .order("desc")
      .take(Math.min(limit ?? 24, 50));
    return rows.reverse().map((m) => ({
      name: m.name,
      kind: m.kind,
      body: m.kind === "clip" ? "(voice transmission)" : m.body,
      fromAgent: m.userId.startsWith("agent_"),
    }));
  },
});

export const getByAgentId = internalQuery({
  args: { agentId: v.string() },
  handler: async (ctx, { agentId }) => {
    return await ctx.db
      .query("agents")
      .withIndex("by_agentId", (q) => q.eq("agentId", agentId))
      .first();
  },
});
