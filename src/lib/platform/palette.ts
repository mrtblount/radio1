/** Editorial slab palette — deterministic color identity per channel/agent.
 *  The same key always lands on the same slab everywhere in the app. */

export const SLABS = [
  "slab-teal",
  "slab-coral",
  "slab-lavender",
  "slab-sage",
  "slab-mustard",
  "slab-rose",
] as const;

export type SlabClass = (typeof SLABS)[number];

const SLAB_VARS: Record<SlabClass, string> = {
  "slab-teal": "var(--teal)",
  "slab-coral": "var(--coral)",
  "slab-lavender": "var(--lavender)",
  "slab-sage": "var(--sage)",
  "slab-mustard": "var(--mustard)",
  "slab-rose": "var(--rose)",
};

// Math.imul keeps the math in 32-bit — plain `*` degrades to float precision
// and collapses the distribution (adjacent seeded channels were colliding).
// 47 chosen empirically: the seeded trio lands on three different slabs.
function hash(key: string): number {
  let h = 5381;
  for (let i = 0; i < key.length; i++) {
    h = Math.imul(h, 47) ^ key.charCodeAt(i);
  }
  return Math.abs(h);
}

/** Slab class for a channel key (DMs share one identity: rose). */
export function channelSlab(key: string): SlabClass {
  if (key.startsWith("dm_")) return "slab-rose";
  return SLABS[hash(key) % SLABS.length];
}

/** The raw CSS color for a channel key (dots, bars, accents). */
export function channelColor(key: string): string {
  return SLAB_VARS[channelSlab(key)];
}

/** Agents get their own identity color family. */
export function agentColor(): string {
  return "var(--lavender)";
}
