/**
 * Device-local identity — no accounts. A stable userId is minted once per
 * device; display name + access code persistence reuses the v1 session
 * helpers (same localStorage keys, so existing devices upgrade seamlessly).
 */
import {
  loadAccessCode,
  loadDisplayName,
  saveAccessCode,
  saveDisplayName,
} from "../radio/session";

export { loadAccessCode, loadDisplayName };

const USER_ID_KEY = "team-radio:userId";
const FORCE_GATE_KEY = "team-radio:forceGate";

function safeGet(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode — identity just won't persist */
  }
}

// Module-level cache: when storage is unavailable (blocked cookies, sandboxed
// iframes), the id must still be stable for the lifetime of this page load —
// a fresh UUID per call would churn every query/mutation identity.
let cachedUserId = "";

export function getUserId(): string {
  if (cachedUserId) return cachedUserId;
  let id = safeGet(USER_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    safeSet(USER_ID_KEY, id);
  }
  cachedUserId = id;
  return id;
}

/** True once a name is stored — passing the gate (or any v1 join) sets it,
 *  so pre-v2 devices upgrade straight into the shell. A forced gate (set when
 *  the server rejects our stored access code) sends the user back through. */
export function isIdentified(): boolean {
  return safeGet(FORCE_GATE_KEY) !== "1" && loadDisplayName().length >= 2;
}

export function saveIdentity(name: string, accessCode: string) {
  saveDisplayName(name);
  saveAccessCode(accessCode);
  try {
    localStorage.removeItem(FORCE_GATE_KEY);
  } catch {
    /* ignore */
  }
}

/** Called when the server rejects our stored code (e.g. rotated ACCESS_CODE):
 *  drop back to the gate on next load, keeping the name prefilled. */
export function forceGate() {
  safeSet(FORCE_GATE_KEY, "1");
  saveAccessCode("");
}
