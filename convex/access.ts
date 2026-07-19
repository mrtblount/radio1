import { query } from "./_generated/server";

/**
 * Optional shared access code, controlled entirely by one env var:
 *   npx convex env set ACCESS_CODE <your-code>          (dev)
 *   npx convex env set ACCESS_CODE <your-code> --prod   (production)
 * Remove the var (`npx convex env remove ACCESS_CODE [--prod]`) and the app
 * behaves exactly as before — no gate, no code field shown.
 */
export type CodeCheck = "ok" | "required" | "invalid";

export function checkCode(provided?: string): CodeCheck {
  const expected = process.env.ACCESS_CODE;
  if (!expected) return "ok";
  if (!provided) return "required";
  return provided === expected ? "ok" : "invalid";
}

export function assertCode(provided?: string): void {
  if (checkCode(provided) !== "ok") {
    throw new Error("Access denied: missing or invalid access code");
  }
}

export const config = query({
  args: {},
  handler: async () => ({ codeRequired: !!process.env.ACCESS_CODE }),
});

/**
 * Optional admin code (same pattern): gates the admin panel (feature flags,
 * channel archive, checklist template).
 *   npx convex env set ADMIN_CODE <code> [--prod]
 * Unset → admin features report "not configured" and stay locked.
 */
export function checkAdminCode(provided?: string): boolean {
  const expected = process.env.ADMIN_CODE;
  if (!expected) return false;
  return provided === expected;
}

export function assertAdminCode(provided?: string): void {
  if (!checkAdminCode(provided)) {
    throw new Error("Admin access denied: missing or invalid admin code");
  }
}
