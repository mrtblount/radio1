"use node";

// ═══════════════════════════════════════════════════════════════════════
// Channel-agent responder (v3) — one utterance in, one radio-brief reply out.
// ═══════════════════════════════════════════════════════════════════════
// Scheduled by agents.maybeTrigger (voice transcripts + text messages).
// House conventions: Anthropic SDK, same model as the ops assistant; a
// failure never surfaces as a broken message — the agent just stays quiet.

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-opus-4-8";
const MAX_TOKENS = 400;

export const run = internalAction({
  args: {
    agentId: v.string(),
    channelKey: v.string(),
    trigger: v.string(),
    speakerName: v.string(),
    source: v.union(v.literal("voice"), v.literal("text")),
    /** The speaker said the agent's name (vs an always-listening agent). */
    addressed: v.boolean(),
  },
  handler: async (ctx, args) => {
    if (!process.env.ANTHROPIC_API_KEY) return; // not configured — stay quiet

    const agent = await ctx.runQuery(internal.agents.getByAgentId, {
      agentId: args.agentId,
    });
    if (!agent || !agent.active) return;
    if (!agent.channelKeys.includes(args.channelKey)) return; // removed mid-flight

    const context = await ctx.runQuery(internal.agents.recentContext, {
      channelKey: args.channelKey,
    });

    const log = context
      .map((m) => `${m.fromAgent ? "[agent] " : ""}${m.name}: ${m.body}`)
      .join("\n");

    const system = [
      `You are ${agent.name}, an AI agent embedded in a team's radio/chat channel ("${args.channelKey}").`,
      `Team brief from whoever configured you:\n${agent.instructions || "(none — be a generally useful teammate)"}`,
      ``,
      `Radio discipline:`,
      `- Reply in plain text only. No markdown, no headers, no lists unless asked.`,
      `- Be BRIEF — one to three short sentences, like a good teammate on the air. Only go longer when explicitly asked for detail.`,
      `- The trigger may be a voice transcript: expect transcription noise, and don't nitpick wording.`,
      args.addressed
        ? `- You were addressed by name. Answer directly.`
        : `- You were NOT addressed by name — you're monitoring. Speak ONLY if you can add something genuinely useful; if not, reply with exactly PASS.`,
    ].join("\n");

    try {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const res = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system,
        messages: [
          {
            role: "user",
            content: `Recent channel log:\n${log}\n\n${args.speakerName} just ${
              args.source === "voice" ? "said over the radio" : "wrote"
            }: "${args.trigger}"`,
          },
        ],
      });
      const text = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
      if (!text || text === "PASS") return;
      await ctx.runMutation(internal.agents.post, {
        agentId: args.agentId,
        channelKey: args.channelKey,
        body: text,
      });
    } catch (err) {
      console.warn("[agent] respond failed", err);
    }
  },
});
