import { ConvexClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type {
  FloorState,
  JoinResult,
  Member,
  RadioBackend,
  Signal,
  SignalKind,
} from "./types";

/** The only file in src/ that knows Convex exists. Swap point for Supabase. */
export class ConvexRadioBackend implements RadioBackend {
  private client: ConvexClient;
  private accessCode: string | undefined;

  constructor(url: string) {
    this.client = new ConvexClient(url);
  }

  setAccessCode(code: string) {
    this.accessCode = code || undefined;
  }

  /** Appended to every call; server ignores it when the gate is off. */
  private get code() {
    return this.accessCode ? { accessCode: this.accessCode } : {};
  }

  async codeRequired() {
    const { codeRequired } = await this.client.query(api.access.config, {});
    return codeRequired;
  }

  async join(
    sessionId: string,
    name: string,
    channel: string,
  ): Promise<JoinResult> {
    return await this.client.mutation(api.presence.join, {
      sessionId,
      name,
      channel,
      ...this.code,
    });
  }

  async leave(sessionId: string) {
    await this.client.mutation(api.presence.leave, { sessionId });
  }

  async acquireFloor(sessionId: string, name: string, channel: string) {
    return await this.client.mutation(api.floor.acquire, {
      sessionId,
      name,
      channel,
      ...this.code,
    });
  }

  async renewFloor(sessionId: string, channel: string) {
    return await this.client.mutation(api.floor.renew, {
      sessionId,
      channel,
      ...this.code,
    });
  }

  async releaseFloor(sessionId: string, channel: string) {
    await this.client.mutation(api.floor.release, {
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
    await this.client.mutation(api.signaling.send, {
      fromSession,
      toSession,
      channel,
      kind,
      payload,
      ...this.code,
    });
  }

  async consumeSignals(ids: string[]) {
    await this.client.mutation(api.signaling.consume, {
      ids: ids as Id<"signals">[],
      ...this.code,
    });
  }

  subscribeRoster(channel: string, cb: (members: Member[]) => void) {
    return this.client.onUpdate(
      api.presence.roster,
      { channel, ...this.code },
      cb,
    );
  }

  subscribeFloor(channel: string, cb: (floor: FloorState | null) => void) {
    return this.client.onUpdate(
      api.floor.current,
      { channel, ...this.code },
      cb,
    );
  }

  subscribeInbox(sessionId: string, cb: (signals: Signal[]) => void) {
    return this.client.onUpdate(
      api.signaling.inbox,
      { toSession: sessionId, ...this.code },
      (rows) => cb(rows as Signal[]),
    );
  }
}

let singleton: ConvexRadioBackend | null = null;

export function getBackend(): ConvexRadioBackend {
  if (!singleton) {
    const url = import.meta.env.VITE_CONVEX_URL as string | undefined;
    if (!url) throw new Error("VITE_CONVEX_URL is not set");
    singleton = new ConvexRadioBackend(url);
  }
  return singleton;
}
