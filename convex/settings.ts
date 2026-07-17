import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { assertAdminCode, checkAdminCode } from "./access";

/** Feature flags + team config (I7). Singleton row; defaults when absent. */
export const teamConfig = query({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db.query("settings").first();
    return {
      aiEnabled: row?.aiEnabled ?? true,
      orgName: row?.orgName,
      adminConfigured: !!process.env.ADMIN_CODE,
    };
  },
});

export const verifyAdmin = query({
  args: { adminCode: v.string() },
  handler: async (_ctx, { adminCode }) => ({ ok: checkAdminCode(adminCode) }),
});

export const setFlags = mutation({
  args: {
    adminCode: v.string(),
    aiEnabled: v.optional(v.boolean()),
    orgName: v.optional(v.string()),
  },
  handler: async (ctx, { adminCode, aiEnabled, orgName }) => {
    assertAdminCode(adminCode);
    const row = await ctx.db.query("settings").first();
    if (row) {
      await ctx.db.patch(row._id, {
        ...(aiEnabled !== undefined ? { aiEnabled } : {}),
        ...(orgName !== undefined ? { orgName } : {}),
      });
    } else {
      await ctx.db.insert("settings", {
        aiEnabled: aiEnabled ?? true,
        orgName,
      });
    }
  },
});
