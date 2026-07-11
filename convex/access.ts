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
