import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { v } from "convex/values";
import { assertCode, assertAdminCode } from "./access";

/** Team-local date key (ET — both pilot teams are Eastern). */
export function todayKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
  }).format(new Date());
}

async function seedFromTemplate(ctx: MutationCtx, date: string) {
  const existing = await ctx.db
    .query("tasks")
    .withIndex("by_date", (q) => q.eq("date", date))
    .first();
  if (existing) return;
  const template = await ctx.db.query("taskTemplate").collect();
  for (const t of template.filter((t) => t.active)) {
    await ctx.db.insert("tasks", {
      date,
      label: t.label,
      order: t.order,
      done: false,
      createdBy: "template",
    });
  }
}

/** Idempotent: make sure today's checklist exists (called from the ops tab). */
export const ensureToday = mutation({
  args: { accessCode: v.optional(v.string()) },
  handler: async (ctx, { accessCode }) => {
    assertCode(accessCode);
    await seedFromTemplate(ctx, todayKey());
  },
});

/** Cron backstop so the checklist exists even before anyone opens the app. */
export const seedToday = internalMutation({
  args: {},
  handler: async (ctx) => {
    await seedFromTemplate(ctx, todayKey());
  },
});

export const today = query({
  args: { accessCode: v.optional(v.string()) },
  handler: async (ctx, { accessCode }) => {
    assertCode(accessCode);
    const rows = await ctx.db
      .query("tasks")
      .withIndex("by_date", (q) => q.eq("date", todayKey()))
      .collect();
    return rows
      .sort((a, b) => a.order - b.order)
      .map((t) => ({
        id: t._id,
        label: t.label,
        done: t.done,
        doneByName: t.doneByName ?? null,
      }));
  },
});

export const toggle = mutation({
  args: {
    id: v.id("tasks"),
    name: v.string(),
    accessCode: v.optional(v.string()),
  },
  handler: async (ctx, { id, name, accessCode }) => {
    assertCode(accessCode);
    const task = await ctx.db.get(id);
    if (!task) return;
    await ctx.db.patch(id, {
      done: !task.done,
      doneByName: task.done ? undefined : name,
    });
  },
});

export const add = mutation({
  args: {
    label: v.string(),
    createdBy: v.string(),
    accessCode: v.optional(v.string()),
  },
  handler: async (ctx, { label, createdBy, accessCode }) => {
    assertCode(accessCode);
    await addTask(ctx, label, createdBy);
  },
});

async function addTask(ctx: MutationCtx, label: string, createdBy: string) {
  const clean = label.trim().slice(0, 120);
  if (clean.length < 2) throw new Error("Task label too short");
  const date = todayKey();
  const existing = await ctx.db
    .query("tasks")
    .withIndex("by_date", (q) => q.eq("date", date))
    .collect();
  const maxOrder = existing.reduce((m, t) => Math.max(m, t.order), 0);
  await ctx.db.insert("tasks", {
    date,
    label: clean,
    order: maxOrder + 1,
    done: false,
    createdBy,
  });
  return clean;
}

// ── Checklist template (admin) ─────────────────────────────────────────────

export const template = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("taskTemplate").collect();
    return rows
      .filter((t) => t.active)
      .sort((a, b) => a.order - b.order)
      .map((t) => ({ id: t._id, label: t.label }));
  },
});

export const templateAdd = mutation({
  args: { label: v.string(), adminCode: v.string() },
  handler: async (ctx, { label, adminCode }) => {
    assertAdminCode(adminCode);
    const clean = label.trim().slice(0, 120);
    if (clean.length < 2) throw new Error("Too short");
    const rows = await ctx.db.query("taskTemplate").collect();
    const maxOrder = rows.reduce((m, t) => Math.max(m, t.order), 0);
    await ctx.db.insert("taskTemplate", {
      label: clean,
      order: maxOrder + 1,
      active: true,
    });
  },
});

export const templateRemove = mutation({
  args: { id: v.id("taskTemplate"), adminCode: v.string() },
  handler: async (ctx, { id, adminCode }) => {
    assertAdminCode(adminCode);
    const row = await ctx.db.get(id);
    if (row) await ctx.db.patch(id, { active: false });
  },
});

// ── Agent-facing internals ─────────────────────────────────────────────────

export const agentAdd = internalMutation({
  args: { label: v.string(), byName: v.string() },
  handler: async (ctx, { label, byName }) => {
    const clean = await addTask(ctx, label, `agent:${byName}`);
    return { added: clean };
  },
});

export const agentComplete = internalMutation({
  args: { label: v.string(), byName: v.string() },
  handler: async (ctx, { label, byName }) => {
    const needle = label.trim().toLowerCase();
    const rows = await ctx.db
      .query("tasks")
      .withIndex("by_date", (q) => q.eq("date", todayKey()))
      .collect();
    const match = rows.find((t) => t.label.toLowerCase().includes(needle));
    if (!match) return { ok: false as const, reason: "no matching task" };
    await ctx.db.patch(match._id, { done: true, doneByName: byName });
    return { ok: true as const, completed: match.label };
  },
});
