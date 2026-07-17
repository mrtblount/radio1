"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-opus-4-8";
const MAX_ROUNDS = 6;

/** The generative-UI contract (PLAN D15) — mirrored in src/lib/blocks/types.ts. */
const RESPOND_SCHEMA = {
  type: "object" as const,
  properties: {
    blocks: {
      type: "array",
      description: "UI blocks rendered natively in the app, in order.",
      items: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["text", "stat", "stats", "chart", "checklist", "actions", "link"],
          },
          md: { type: "string", description: "text: markdown-lite (bold, lists)" },
          label: { type: "string", description: "stat: label" },
          value: { type: "string", description: "stat: the value, keep short" },
          sub: { type: "string", description: "stat: small print under the value" },
          items: {
            type: "array",
            description:
              "stats: [{label,value,sub?}] · checklist: [{label,done}] · actions: [{label,action,arg?}]",
            items: { type: "object" },
          },
          kind: { type: "string", enum: ["bar", "line"], description: "chart type" },
          title: { type: "string", description: "chart title" },
          points: {
            type: "array",
            description: "chart: [{label, value}] — real data only",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                value: { type: "number" },
              },
              required: ["label", "value"],
            },
          },
          url: { type: "string", description: "link: destination" },
        },
        required: ["type"],
      },
    },
  },
  required: ["blocks"],
};

const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_roster",
    description:
      "Who is on the team right now: name, online (app open), and which radio channel they're on the air on, if any.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_transmissions",
    description:
      "Recent radio transmissions with transcripts. Call this when asked what was said on the radio, what happened, or what someone missed.",
    input_schema: {
      type: "object",
      properties: {
        hours: { type: "number", description: "look-back window, default 24" },
        channel: { type: "string", description: "limit to one channel, e.g. Security" },
      },
    },
  },
  {
    name: "get_chat_activity",
    description:
      "Recent team chat activity per channel: message counts, the asker's unread counts, and the latest messages.",
    input_schema: {
      type: "object",
      properties: {
        hours: { type: "number", description: "look-back window, default 24" },
      },
    },
  },
  {
    name: "get_tasks",
    description: "Today's team checklist with completion state.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "add_task",
    description: "Add an item to today's team checklist. Call when asked to add a task.",
    input_schema: {
      type: "object",
      properties: { label: { type: "string" } },
      required: ["label"],
    },
  },
  {
    name: "complete_task",
    description:
      "Mark a checklist item done, matched by (partial) label. Call when told something on the list is finished.",
    input_schema: {
      type: "object",
      properties: { label: { type: "string" } },
      required: ["label"],
    },
  },
  {
    name: "respond",
    description:
      "REQUIRED final step: deliver your answer as UI blocks. Every reply ends with exactly one respond call.",
    input_schema: RESPOND_SCHEMA,
  },
];

/** Friendly working-state narration between tool rounds. */
const STATUS_LABELS: Record<string, string> = {
  get_roster: "Checking who's on duty…",
  get_transmissions: "Reading the transmission log…",
  get_chat_activity: "Scanning team chat…",
  get_tasks: "Pulling up the checklist…",
  add_task: "Adding it to the checklist…",
  complete_task: "Checking it off…",
};

function systemPrompt(userName: string, orgName?: string): string {
  const now = new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `You are OPS, the operations assistant inside ${orgName ?? "this team"}'s radio app (push-to-talk radio + team chat). You are talking to ${userName}. Current time: ${now} (Eastern).

The team uses this app in the field: security details, parking, retail floors. Answers must be immediately useful on a phone.

Rules:
- Answer EXACTLY what was asked — no padding, no preamble.
- Use your tools to look at real data before answering questions about the team, the radio, chat, or tasks. Never invent numbers or names.
- Numeric or list-shaped answers go in stat/stats/chart/checklist blocks, not prose or markdown tables. Chart values must be real data.
- Keep text blocks short; markdown limited to **bold** and simple "- " lists.
- ALWAYS finish by calling the respond tool exactly once with your final blocks. Text outside respond is never shown to the user.
- If a question needs data you don't have access to, say so plainly in a text block.`;
}

export const run = internalAction({
  args: {
    userId: v.string(),
    placeholderId: v.id("aiMessages"),
  },
  handler: async (ctx, { userId, placeholderId }) => {
    const fail = async (text: string) => {
      await ctx.runMutation(internal.ai.patchAssistant, {
        id: placeholderId,
        text,
        status: "error",
      });
    };

    if (!process.env.ANTHROPIC_API_KEY) {
      await fail("The assistant isn't configured yet (missing API key).");
      return;
    }

    try {
      const runInfo = await ctx.runQuery(internal.ai.getRun, { userId });
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

      // History (excluding the placeholder) as alternating turns.
      const messages: Anthropic.MessageParam[] = runInfo.history.map((m) => ({
        role: m.role,
        content: m.text,
      }));

      const narrate = (text: string) =>
        ctx.runMutation(internal.ai.patchAssistant, { id: placeholderId, text });

      const execTool = async (
        name: string,
        input: Record<string, unknown>,
      ): Promise<unknown> => {
        switch (name) {
          case "get_roster":
            return await ctx.runQuery(internal.ai.ctxRoster, {});
          case "get_transmissions":
            return await ctx.runQuery(internal.ai.ctxTransmissions, {
              hours: typeof input.hours === "number" ? input.hours : 24,
              userId,
              channel:
                typeof input.channel === "string" ? input.channel : undefined,
            });
          case "get_chat_activity":
            return await ctx.runQuery(internal.ai.ctxChatActivity, {
              hours: typeof input.hours === "number" ? input.hours : 24,
              userId,
            });
          case "get_tasks":
            return await ctx.runQuery(internal.ai.ctxTasks, {});
          case "add_task":
            return await ctx.runMutation(internal.tasks.agentAdd, {
              label: String(input.label ?? ""),
              byName: runInfo.userName,
            });
          case "complete_task":
            return await ctx.runMutation(internal.tasks.agentComplete, {
              label: String(input.label ?? ""),
              byName: runInfo.userName,
            });
          default:
            return { error: `unknown tool ${name}` };
        }
      };

      let blocks: unknown[] | null = null;
      let lastText = "";

      for (let round = 0; round < MAX_ROUNDS && !blocks; round++) {
        const response = await client.messages.create({
          model: MODEL,
          max_tokens: 4096,
          thinking: { type: "adaptive" },
          // Snappy ops answers; raise if depth ever beats latency here.
          output_config: { effort: "medium" },
          system: systemPrompt(runInfo.userName, runInfo.orgName),
          tools: TOOLS,
          messages,
        });

        if (response.stop_reason === "refusal") {
          await fail("I can't help with that one.");
          return;
        }

        const toolUses = response.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
        );
        for (const b of response.content) {
          if (b.type === "text") lastText = b.text;
        }

        if (toolUses.length === 0) break; // model answered in prose — wrap below

        messages.push({ role: "assistant", content: response.content });

        const results: Anthropic.ToolResultBlockParam[] = [];
        for (const use of toolUses) {
          const input = (use.input ?? {}) as Record<string, unknown>;
          if (use.name === "respond") {
            const maybe = (input as { blocks?: unknown[] }).blocks;
            if (Array.isArray(maybe)) blocks = maybe;
            results.push({
              type: "tool_result",
              tool_use_id: use.id,
              content: "delivered",
            });
            continue;
          }
          const label = STATUS_LABELS[use.name];
          if (label) await narrate(label);
          try {
            const result = await execTool(use.name, input);
            results.push({
              type: "tool_result",
              tool_use_id: use.id,
              content: JSON.stringify(result),
            });
          } catch (err) {
            results.push({
              type: "tool_result",
              tool_use_id: use.id,
              content: `error: ${err instanceof Error ? err.message : "failed"}`,
              is_error: true,
            });
          }
        }
        messages.push({ role: "user", content: results });
      }

      if (!blocks) {
        // Resilient fallback: surface whatever prose the model produced.
        blocks = [
          {
            type: "text",
            md: lastText || "I couldn't put an answer together — try asking again.",
          },
        ];
      }

      const textFallback =
        (blocks.find(
          (b) => (b as { type?: string }).type === "text",
        ) as { md?: string } | undefined)?.md ?? "(answered with blocks)";

      await ctx.runMutation(internal.ai.patchAssistant, {
        id: placeholderId,
        text: textFallback,
        blocksJson: JSON.stringify(blocks),
        status: "done",
      });
    } catch (err) {
      console.error("[aiAgent] failed", err);
      const detail =
        err instanceof Error ? ` (${err.message.slice(0, 160)})` : "";
      await fail(
        `I hit a snag reaching the assistant — give it a moment and try again.${detail}`,
      );
    }
  },
});
