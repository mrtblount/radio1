"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import webpush from "web-push";

function configured(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

function setup() {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:radio@example.com",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
}

interface SubRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface Payload {
  title: string;
  body: string;
  tag: string;
  url: string;
}

async function deliver(
  subs: SubRow[],
  payload: Payload,
): Promise<string[]> {
  const dead: string[] = [];
  const body = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body,
          { TTL: 3600, urgency: "high" },
        );
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          dead.push(sub.id);
        } else {
          console.warn("[push] send failed", sub.endpoint.slice(0, 40), status);
        }
      }
    }),
  );
  return dead;
}

/** Deliver every recipient group in a plan (regular + mention pings, D23). */
async function deliverGroups(
  groups: { subs: SubRow[]; payload: Payload }[],
): Promise<string[]> {
  const dead: string[] = [];
  for (const group of groups) {
    if (group.subs.length === 0) continue;
    dead.push(...(await deliver(group.subs, group.payload)));
  }
  return dead;
}

export const notifyMessage = internalAction({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }) => {
    if (!configured()) return;
    setup();
    const plan = await ctx.runQuery(internal.push.messageRecipients, {
      messageId,
    });
    if (!plan) return;
    const dead = await deliverGroups(plan.groups as never);
    if (dead.length) {
      await ctx.runMutation(internal.push.prune, { ids: dead as never });
    }
  },
});

export const notifyClip = internalAction({
  args: { transmissionId: v.id("transmissions") },
  handler: async (ctx, { transmissionId }) => {
    if (!configured()) return;
    setup();
    const plan = await ctx.runQuery(internal.push.clipRecipients, {
      transmissionId,
    });
    if (!plan) return;
    const dead = await deliverGroups(plan.groups as never);
    if (dead.length) {
      await ctx.runMutation(internal.push.prune, { ids: dead as never });
    }
  },
});
