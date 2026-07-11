export interface Member {
  sessionId: string;
  name: string;
  joinedAt: number;
}

export interface FloorState {
  sessionId: string;
  name: string;
  since: number;
}

export type SignalKind = "offer" | "answer" | "ice";

export interface Signal {
  id: string;
  fromSession: string;
  channel: string;
  kind: SignalKind;
  payload: string;
}

export type PeerConnState = "connecting" | "connected" | "failed";

export type JoinResult =
  | { ok: true }
  | { ok: false; reason: "code-required" | "code-invalid" };

/**
 * The full control-plane contract. `convexBackend.ts` is the only implementation
 * today; a Supabase port implements this same interface against
 * Supabase Realtime + Postgres (see INTEGRATION.md).
 */
export interface RadioBackend {
  /** Shared access code sent with every subsequent call (no-op if gate is off). */
  setAccessCode(code: string): void;
  /** Whether the deployment currently requires an access code to join. */
  codeRequired(): Promise<boolean>;

  join(sessionId: string, name: string, channel: string): Promise<JoinResult>;
  leave(sessionId: string): Promise<void>;

  acquireFloor(
    sessionId: string,
    name: string,
    channel: string,
  ): Promise<{ granted: boolean; holder?: string }>;
  renewFloor(sessionId: string, channel: string): Promise<{ held: boolean }>;
  releaseFloor(sessionId: string, channel: string): Promise<void>;

  sendSignal(
    fromSession: string,
    toSession: string,
    channel: string,
    kind: SignalKind,
    payload: string,
  ): Promise<void>;
  consumeSignals(ids: string[]): Promise<void>;

  subscribeRoster(
    channel: string,
    cb: (members: Member[]) => void,
  ): () => void;
  subscribeFloor(
    channel: string,
    cb: (floor: FloorState | null) => void,
  ): () => void;
  subscribeInbox(sessionId: string, cb: (signals: Signal[]) => void): () => void;
}

export { CHANNELS } from "../../channels";
