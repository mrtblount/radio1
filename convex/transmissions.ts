import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { assertCode } from "./access";

export const uploadUrl = mutation({
  args: { accessCode: v.optional(v.string()) },
  handler: async (ctx, { accessCode }) => {
    assertCode(accessCode);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Finalize a finished transmission: durable row + a clip entry in the
 * channel's chat log (D10), then transcription (async, optional).
 */
export const record = mutation({
  args: {
    channelKey: v.string(),
    userId: v.string(),
    sessionId: v.string(),
    startedAt: v.number(),
    durationMs: v.number(),
    storageId: v.id("_storage"),
    mimeType: v.string(),
    accessCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { accessCode, ...clip } = args;
    assertCode(accessCode);
    const user = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", clip.userId))
      .unique();
    const name = user?.name ?? "Unknown";

    const id = await ctx.db.insert("transmissions", {
      ...clip,
      name,
      transcriptStatus: "pending",
    });

    await ctx.db.insert("messages", {
      channelKey: clip.channelKey,
      userId: clip.userId,
      name,
      kind: "clip",
      body: "(transmission)",
      clipId: id,
      createdAt: clip.startedAt,
    });

    await ctx.scheduler.runAfter(0, internal.transcribe.run, {
      transmissionId: id,
    });
    await ctx.scheduler.runAfter(0, internal.pushSend.notifyClip, {
      transmissionId: id,
    });
    return { id };
  },
});

/** Everything a clip player needs (URL is minted on read). */
export const clip = query({
  args: { id: v.id("transmissions"), accessCode: v.optional(v.string()) },
  handler: async (ctx, { id, accessCode }) => {
    assertCode(accessCode);
    const row = await ctx.db.get(id);
    if (!row) return null;
    return {
      url: await ctx.storage.getUrl(row.storageId),
      name: row.name,
      channelKey: row.channelKey,
      startedAt: row.startedAt,
      durationMs: row.durationMs,
      mimeType: row.mimeType,
      transcript: row.transcript ?? null,
      transcriptStatus: row.transcriptStatus,
    };
  },
});

/** Recent transmissions for a channel (the LOG sheet). */
export const forChannel = query({
  args: { channelKey: v.string(), accessCode: v.optional(v.string()) },
  handler: async (ctx, { channelKey, accessCode }) => {
    assertCode(accessCode);
    const rows = await ctx.db
      .query("transmissions")
      .withIndex("by_channel", (q) => q.eq("channelKey", channelKey))
      .order("desc")
      .take(50);
    return rows.map((r) => ({
      id: r._id,
      name: r.name,
      startedAt: r.startedAt,
      durationMs: r.durationMs,
      transcript: r.transcript ?? null,
      transcriptStatus: r.transcriptStatus,
    }));
  },
});

// ── internals for the transcription action ────────────────────────────────

export const getForTranscription = internalQuery({
  args: { transmissionId: v.id("transmissions") },
  handler: async (ctx, { transmissionId }) => {
    const row = await ctx.db.get(transmissionId);
    if (!row) return null;
    return {
      storageId: row.storageId,
      mimeType: row.mimeType,
      url: await ctx.storage.getUrl(row.storageId),
    };
  },
});

export const setTranscript = internalMutation({
  args: {
    transmissionId: v.id("transmissions"),
    transcript: v.optional(v.string()),
    status: v.union(
      v.literal("done"),
      v.literal("failed"),
      v.literal("skipped"),
    ),
  },
  handler: async (ctx, { transmissionId, transcript, status }) => {
    const row = await ctx.db.get(transmissionId);
    if (!row) return;
    await ctx.db.patch(transmissionId, {
      transcript,
      transcriptStatus: status,
    });
  },
});
