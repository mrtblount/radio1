const NAME_KEY = "team-radio:name";
const CODE_KEY = "team-radio:code";

/**
 * A session identity lives exactly as long as one app load. A fresh id per load
 * avoids every class of stale-mesh bug on reload; the old row sweeps out of the
 * roster within 30s server-side.
 */
export function mintSessionId(): string {
  return crypto.randomUUID();
}

export function loadDisplayName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveDisplayName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // private browsing — losing name persistence is fine
  }
}

/** Access code is remembered per device so the team enters it once. */
export function loadAccessCode(): string {
  try {
    return localStorage.getItem(CODE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveAccessCode(code: string): void {
  try {
    localStorage.setItem(CODE_KEY, code);
  } catch {
    // private browsing — they'll re-enter next time
  }
}
