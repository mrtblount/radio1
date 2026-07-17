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

export function getUserId(): string {
  let id = safeGet(USER_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    safeSet(USER_ID_KEY, id);
  }
  return id;
}

/** True once a name is stored — passing the gate (or any v1 join) sets it,
 *  so pre-v2 devices upgrade straight into the shell. Stale access codes are
 *  handled at runtime (server rejection drops back to the gate). */
export function isIdentified(): boolean {
  return loadDisplayName().length >= 2;
}

export function saveIdentity(name: string, accessCode: string) {
  saveDisplayName(name);
  saveAccessCode(accessCode);
}
