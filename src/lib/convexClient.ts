import { ConvexReactClient } from "convex/react";

/**
 * The single Convex connection for the whole app (one websocket).
 * - New platform surfaces (chat, ops, push, settings) use convex/react hooks
 *   via <ConvexProvider client={convexClient}>.
 * - The radio core never touches this directly: it goes through the
 *   RadioBackend interface, whose Convex implementation wraps this client
 *   (see lib/radio/convexBackend.ts).
 */
export const convexClient = new ConvexReactClient(
  import.meta.env.VITE_CONVEX_URL as string,
);
