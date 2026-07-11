import type { PeerConnState, Signal, SignalKind } from "./types";

/**
 * Free ICE servers. Same-WiFi (same site) connects via host candidates;
 * STUN covers most cross-network cases; OpenRelay TURN is the fallback for
 * strict cellular NATs. For production traffic, mint dedicated TURN credentials
 * (free tier) at https://www.metered.ca/tools/openrelay/ — see INTEGRATION.md.
 */
const ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  { urls: "stun:stun.cloudflare.com:3478" },
  {
    urls: [
      "turn:staticauth.openrelay.metered.ca:80",
      "turn:staticauth.openrelay.metered.ca:443",
      "turn:staticauth.openrelay.metered.ca:443?transport=tcp",
    ],
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

const RECONNECT_GRACE_MS = 8_000;

interface PeerEntry {
  pc: RTCPeerConnection;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  hasRemoteDescription: boolean;
  pendingCandidates: RTCIceCandidateInit[];
  audioEl: HTMLAudioElement;
  queue: Promise<void>;
  failTimer: number | null;
}

interface MeshOptions {
  sessionId: string;
  localTrack: MediaStreamTrack;
  localStream: MediaStream;
  sendSignal: (to: string, kind: SignalKind, payload: string) => Promise<void>;
  onPeerStates: (states: Record<string, PeerConnState>) => void;
}

/**
 * Full-mesh audio with pre-established connections (PLAN D1): every pair
 * negotiates at join time with the mic track attached but disabled, so PTT is
 * just a track toggle — no renegotiation on press.
 *
 * Glare-safe via the "perfect negotiation" pattern (PLAN D3): politeness is
 * decided by sessionId comparison, identical-but-opposite at both ends.
 */
export class RadioMesh {
  private peers = new Map<string, PeerEntry>();
  private knownMembers = new Set<string>();
  private pendingPlay = new Set<HTMLAudioElement>();
  private destroyed = false;

  constructor(private opts: MeshOptions) {}

  /** Reconcile the peer set to the current roster. */
  syncPeers(memberIds: string[]): void {
    if (this.destroyed) return;
    this.knownMembers = new Set(
      memberIds.filter((id) => id !== this.opts.sessionId),
    );
    for (const id of this.knownMembers) {
      if (!this.peers.has(id)) this.createPeer(id);
    }
    for (const id of [...this.peers.keys()]) {
      if (!this.knownMembers.has(id)) this.destroyPeer(id);
    }
    this.emitStates();
  }

  /** Route one signaling message; serialized per-peer to preserve order. */
  handleSignal(signal: Signal): void {
    if (this.destroyed) return;
    const from = signal.fromSession;
    let entry = this.peers.get(from);
    if (!entry) {
      // A signal from a member we haven't seen in the roster yet — they just
      // joined. Create the connection so their offer lands somewhere.
      this.knownMembers.add(from);
      entry = this.createPeer(from);
    }
    entry.queue = entry.queue
      .then(() => this.processSignal(entry!, from, signal))
      .catch((err) => console.warn("[mesh] signal processing failed", err));
  }

  /** Tear down and re-offer any dead connections (called on visibility return). */
  reconcile(): void {
    if (this.destroyed) return;
    for (const [id, entry] of this.peers) {
      const st = entry.pc.connectionState;
      if (st === "failed" || st === "closed" || st === "disconnected") {
        this.recreatePeer(id);
      }
    }
    this.retryPendingAudio();
  }

  /** iOS autoplay recovery: retry any blocked audio elements on a user gesture. */
  retryPendingAudio(): void {
    for (const el of [...this.pendingPlay]) {
      void el
        .play()
        .then(() => this.pendingPlay.delete(el))
        .catch(() => {});
    }
  }

  destroy(): void {
    this.destroyed = true;
    for (const id of [...this.peers.keys()]) this.destroyPeer(id);
    this.emitStates();
  }

  private createPeer(peerId: string): PeerEntry {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    const audioEl = document.createElement("audio");
    audioEl.autoplay = true;
    audioEl.setAttribute("playsinline", "");
    audioEl.dataset.peer = peerId;
    audioEl.style.display = "none";
    document.body.appendChild(audioEl);

    const entry: PeerEntry = {
      pc,
      polite: this.opts.sessionId < peerId,
      makingOffer: false,
      ignoreOffer: false,
      hasRemoteDescription: false,
      pendingCandidates: [],
      audioEl,
      queue: Promise.resolve(),
      failTimer: null,
    };
    this.peers.set(peerId, entry);

    pc.addTrack(this.opts.localTrack, this.opts.localStream);

    pc.onnegotiationneeded = async () => {
      try {
        entry.makingOffer = true;
        await pc.setLocalDescription();
        await this.opts.sendSignal(
          peerId,
          "offer",
          JSON.stringify(pc.localDescription),
        );
      } catch (err) {
        console.warn("[mesh] negotiation failed", err);
      } finally {
        entry.makingOffer = false;
      }
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        void this.opts.sendSignal(peerId, "ice", JSON.stringify(e.candidate));
      }
    };

    pc.ontrack = (e) => {
      const stream = e.streams[0] ?? new MediaStream([e.track]);
      audioEl.srcObject = stream;
      void audioEl.play().catch(() => this.pendingPlay.add(audioEl));
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "failed") pc.restartIce();
    };

    pc.onconnectionstatechange = () => {
      this.emitStates();
      if (pc.connectionState === "failed") {
        // restartIce may still save it; give it a grace period, then rebuild.
        if (entry.failTimer === null) {
          entry.failTimer = window.setTimeout(() => {
            entry.failTimer = null;
            if (
              this.peers.get(peerId) === entry &&
              entry.pc.connectionState !== "connected"
            ) {
              this.recreatePeer(peerId);
            }
          }, RECONNECT_GRACE_MS);
        }
      } else if (pc.connectionState === "connected" && entry.failTimer !== null) {
        clearTimeout(entry.failTimer);
        entry.failTimer = null;
      }
    };

    this.emitStates();
    return entry;
  }

  private async processSignal(
    entry: PeerEntry,
    peerId: string,
    signal: Signal,
  ): Promise<void> {
    const pc = entry.pc;
    if (pc.signalingState === "closed") return;

    if (signal.kind === "ice") {
      const candidate = JSON.parse(signal.payload) as RTCIceCandidateInit;
      if (!entry.hasRemoteDescription) {
        entry.pendingCandidates.push(candidate);
        return;
      }
      try {
        await pc.addIceCandidate(candidate);
      } catch (err) {
        if (!entry.ignoreOffer) console.warn("[mesh] addIceCandidate", err);
      }
      return;
    }

    const description = JSON.parse(
      signal.payload,
    ) as RTCSessionDescriptionInit;
    const offerCollision =
      description.type === "offer" &&
      (entry.makingOffer || pc.signalingState !== "stable");
    entry.ignoreOffer = !entry.polite && offerCollision;
    if (entry.ignoreOffer) return;

    await pc.setRemoteDescription(description);
    entry.hasRemoteDescription = true;
    for (const c of entry.pendingCandidates.splice(0)) {
      try {
        await pc.addIceCandidate(c);
      } catch {
        // stale candidate after renegotiation — harmless
      }
    }
    if (description.type === "offer") {
      await pc.setLocalDescription();
      await this.opts.sendSignal(
        peerId,
        "answer",
        JSON.stringify(pc.localDescription),
      );
    }
  }

  private recreatePeer(peerId: string): void {
    this.destroyPeer(peerId);
    if (this.knownMembers.has(peerId)) this.createPeer(peerId);
    this.emitStates();
  }

  private destroyPeer(peerId: string): void {
    const entry = this.peers.get(peerId);
    if (!entry) return;
    this.peers.delete(peerId);
    if (entry.failTimer !== null) clearTimeout(entry.failTimer);
    entry.pc.onnegotiationneeded = null;
    entry.pc.onicecandidate = null;
    entry.pc.ontrack = null;
    entry.pc.onconnectionstatechange = null;
    entry.pc.oniceconnectionstatechange = null;
    entry.pc.close();
    entry.audioEl.srcObject = null;
    entry.audioEl.remove();
    this.pendingPlay.delete(entry.audioEl);
  }

  private emitStates(): void {
    const out: Record<string, PeerConnState> = {};
    for (const [id, entry] of this.peers) {
      const st = entry.pc.connectionState;
      out[id] =
        st === "connected"
          ? "connected"
          : st === "failed" || st === "closed" || st === "disconnected"
            ? "failed"
            : "connecting";
    }
    this.opts.onPeerStates(out);
  }
}
