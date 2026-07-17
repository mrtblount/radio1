/** Generative-UI block union (PLAN D15). Server contract in convex/aiAgent.ts. */

export interface StatItem {
  label: string;
  value: string;
  sub?: string;
}

export interface ChecklistItem {
  label: string;
  done: boolean;
}

export interface ActionItem {
  label: string;
  action: "open_channel" | "open_radio" | string;
  arg?: string;
}

export type Block =
  | { type: "text"; md: string }
  | ({ type: "stat" } & StatItem)
  | { type: "stats"; items: StatItem[] }
  | {
      type: "chart";
      kind?: "bar" | "line";
      title?: string;
      points: { label: string; value: number }[];
    }
  | { type: "checklist"; items: ChecklistItem[] }
  | { type: "actions"; items: ActionItem[] }
  | { type: "link"; label?: string; url: string };

/** Tolerant parse: unknown/malformed entries are dropped, never fatal. */
export function parseBlocks(json: string | null): Block[] {
  if (!json) return [];
  try {
    const raw = JSON.parse(json);
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (b): b is Block =>
        !!b &&
        typeof b === "object" &&
        typeof (b as { type?: unknown }).type === "string" &&
        ["text", "stat", "stats", "chart", "checklist", "actions", "link"].includes(
          (b as { type: string }).type,
        ),
    );
  } catch {
    return [];
  }
}
