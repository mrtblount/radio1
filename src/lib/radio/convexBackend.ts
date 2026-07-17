import type { FunctionReference } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { convexClient } from "../convexClient";
import type {
  FloorState,
  JoinResult,
  Member,
  RadioBackend,
  Signal,
  SignalKind,
} from "./types";

/**
 * Convex implementation of RadioBackend. Wraps the app-wide shared
 * ConvexReactClient (one websocket for radio + chat + ops) — the radio core
 * itself still only knows this interface, so the backend stays swappable.
 */
export class ConvexRadioBackend implements RadioBackend {
  private accessCode: string | undefined;

  setAccessCode(code: string) {
    this.accessCode = code || undefined;
  }

  /** Appended to every call; server ignores it when the gate is off. */
  private get code() {
    return this.accessCode ? { accessCode: this.accessCode } : {};
  }

  /** Reactive subscription adapter: deliver current value + every update. */
  private subscribe<T>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query: FunctionReference<"query", "public", any, T>,
    args: Record<string, unknown>,
    cb: (value: T) => void,
  ): () => void {
    const watch = convexClient.watchQuery(query, args);
    const push = () => {
      // localQueryResult throws if the query errored; treat as no-update
      // (Convex retries internally and a later update will land).
      try {
        const value = watch.localQueryResult();
        if (value !== undefined) cb(value as T);
      } catch {
        /* transient query error — wait for next update */
      }
    };
    const unsubscribe = watch.onUpdate(push);
    push();
    return unsubscribe;
  }

  async codeRequired() {
    const { codeRequired } = await convexClient.query(api.access.config, {});
    return codeRequired;
  }

  async join(
    sessionId: string,
    name: string,
    channel: string,
    userId?: string,
  ): Promise<JoinResult> {
    return await convexClient.mutation(api.presence.join, {
      sessionId,
      name,
      channel,
      userId,
      ...this.code,
    });
  }

  async leave(sessionId: string) {
    await convexClient.mutation(api.presence.leave, { sessionId });
  }

  async acquireFloor(sessionId: string, name: string, channel: string) {
    return await convexClient.mutation(api.floor.acquire, {
      sessionId,
      name,
      channel,
      ...this.code,
    });
  }

  async renewFloor(sessionId: string, channel: string) {
    return await convexClient.mutation(api.floor.renew, {
      sessionId,
      channel,
      ...this.code,
    });
  }

  async releaseFloor(sessionId: string, channel: string) {
    await convexClient.mutation(api.floor.release, {
      sessionId,
      channel,
      ...this.code,
    });
  }

  async sendSignal(
    fromSession: string,
    toSession: string,
    channel: string,
    kind: SignalKind,
    payload: string,
  ) {
    await convexClient.mutation(api.signaling.send, {
      fromSession,
      toSession,
      channel,
      kind,
      payload,
      ...this.code,
    });
  }

  async consumeSignals(ids: string[]) {
    await convexClient.mutation(api.signaling.consume, {
      ids: ids as Id<"signals">[],
      ...this.code,
    });
  }

  subscribeRoster(channel: string, cb: (members: Member[]) => void) {
    return this.subscribe(api.presence.roster, { channel, ...this.code }, cb);
  }

  subscribeFloor(channel: string, cb: (floor: FloorState | null) => void) {
    return this.subscribe(api.floor.current, { channel, ...this.code }, cb);
  }

  subscribeInbox(sessionId: string, cb: (signals: Signal[]) => void) {
    return this.subscribe(
      api.signaling.inbox,
      { toSession: sessionId, ...this.code },
      (rows) => cb(rows as Signal[]),
    );
  }
}

let singleton: ConvexRadioBackend | null = null;

export function getBackend(): ConvexRadioBackend {
  if (!singleton) singleton = new ConvexRadioBackend();
  return singleton;
}
