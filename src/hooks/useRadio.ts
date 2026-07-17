import { useCallback, useEffect, useRef, useState } from "react";
import { getBackend } from "../lib/radio/convexBackend";
import { RadioMesh } from "../lib/radio/mesh";
import {
  beepBusy,
  beepGrant,
  beepIncoming,
  beepRelease,
  initAudio,
} from "../lib/radio/beeps";
import {
  mintSessionId,
  saveAccessCode,
  saveDisplayName,
} from "../lib/radio/session";
import { getUserId } from "../lib/platform/identity";
import { TransmissionRecorder } from "../lib/radio/recorder";
import { uploadTransmission } from "../lib/platform/clips";

/** Clips shorter than this are accidental taps — not history. */
const MIN_CLIP_MS = 400;
import type {
  FloorState,
  Member,
  PeerConnState,
  Signal,
} from "../lib/radio/types";

const HEARTBEAT_MS = 10_000;
const FLOOR_RENEW_MS = 5_000;
const BUSY_FLASH_MS = 600;

export interface RadioState {
  screen: "join" | "channel";
  joining: boolean;
  sessionId: string;
  name: string;
  channel: string;
  members: Member[];
  floor: FloorState | null;
  /** I hold the floor and my mic track is live. */
  talking: boolean;
  /** Press received, floor grant in flight. */
  requesting: boolean;
  /** Brief "channel busy" feedback pulse. */
  busy: boolean;
  peerStates: Record<string, PeerConnState>;
  joinError: string | null;
}

const initialState: RadioState = {
  screen: "join",
  joining: false,
  sessionId: "",
  name: "",
  channel: "",
  members: [],
  floor: null,
  talking: false,
  requesting: false,
  busy: false,
  peerStates: {},
  joinError: null,
};

export function useRadio() {
  const [state, setState] = useState<RadioState>(initialState);

  const sessionIdRef = useRef<string>("");
  const nameRef = useRef<string>("");
  const channelRef = useRef<string>("");
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const meshRef = useRef<RadioMesh | null>(null);
  const unsubsRef = useRef<Array<() => void>>([]);
  const heartbeatRef = useRef<number | null>(null);
  const renewRef = useRef<number | null>(null);
  const busyTimerRef = useRef<number | null>(null);
  const processedSignals = useRef<Set<string>>(new Set());
  const pressActiveRef = useRef(false);
  const talkingRef = useRef(false);
  const joinedRef = useRef(false);
  const prevFloorRef = useRef<FloorState | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const recorderRef = useRef<TransmissionRecorder | null>(null);

  const flashBusy = useCallback(() => {
    beepBusy();
    navigator.vibrate?.([40, 60, 40]);
    setState((s) => ({ ...s, busy: true }));
    if (busyTimerRef.current !== null) clearTimeout(busyTimerRef.current);
    busyTimerRef.current = window.setTimeout(
      () => setState((s) => ({ ...s, busy: false })),
      BUSY_FLASH_MS,
    );
  }, []);

  const stopTransmit = useCallback((withBeep: boolean) => {
    // I2 — cut the mic first, unconditionally, before any async work.
    if (trackRef.current) trackRef.current.enabled = false;
    talkingRef.current = false;
    if (renewRef.current !== null) {
      clearInterval(renewRef.current);
      renewRef.current = null;
    }
    setState((s) => ({ ...s, talking: false, requesting: false }));
    if (withBeep) beepRelease();
    if (joinedRef.current) {
      void getBackend().releaseFloor(sessionIdRef.current, channelRef.current);
    }
    // I3′ — after the mic is cut, finish the clip and upload in the background.
    const recorder = recorderRef.current;
    if (recorder) {
      const clipChannel = channelRef.current;
      const clipSession = sessionIdRef.current;
      void recorder.stop().then((finished) => {
        if (finished && finished.durationMs >= MIN_CLIP_MS) {
          void uploadTransmission(finished, clipChannel, clipSession);
        }
      });
    }
  }, []);

  const requestWakeLock = useCallback(async () => {
    try {
      if ("wakeLock" in navigator && document.visibilityState === "visible") {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
      }
    } catch {
      // Wake lock is best-effort (unsupported browser or low battery mode).
    }
  }, []);

  const join = useCallback(
    async (name: string, channel: string, accessCode = "") => {
      const backend = getBackend();
      backend.setAccessCode(accessCode);
      setState((s) => ({ ...s, joining: true, joinError: null }));
      // Inside the tap's call stack: unlock audio for iOS before any await.
      initAudio();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        const track = stream.getAudioTracks()[0];
        track.enabled = false; // I2 — never hot on join
        streamRef.current = stream;
        trackRef.current = track;
        recorderRef.current = new TransmissionRecorder(track);
      } catch {
        setState((s) => ({
          ...s,
          joining: false,
          joinError:
            "Microphone access is required. Enable it for this site in your browser settings (iPhone: aA menu → Website Settings · Android: lock icon → Permissions), then try again.",
        }));
        return;
      }

      const sessionId = mintSessionId();
      sessionIdRef.current = sessionId;
      nameRef.current = name;
      channelRef.current = channel;
      saveDisplayName(name);

      const mesh = new RadioMesh({
        sessionId,
        localTrack: trackRef.current!,
        localStream: streamRef.current!,
        sendSignal: (to, kind, payload) =>
          backend.sendSignal(sessionId, to, channel, kind, payload),
        onPeerStates: (peerStates) =>
          setState((s) => ({ ...s, peerStates })),
      });
      meshRef.current = mesh;

      const bail = (joinError: string) => {
        mesh.destroy();
        recorderRef.current?.cancel();
        recorderRef.current = null;
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        trackRef.current = null;
        setState((s) => ({ ...s, joining: false, joinError }));
      };

      try {
        const result = await backend.join(sessionId, name, channel, getUserId());
        if (!result.ok) {
          bail(
            result.reason === "code-invalid"
              ? "That access code isn't right. Check with your team lead and try again."
              : "This radio requires an access code — ask your team lead for it.",
          );
          return;
        }
      } catch {
        bail(
          "Couldn't reach the radio server. Check your connection and try again.",
        );
        return;
      }
      saveAccessCode(accessCode);
      joinedRef.current = true;

      unsubsRef.current.push(
        backend.subscribeRoster(channel, (members) => {
          setState((s) => ({ ...s, members }));
          mesh.syncPeers(members.map((m) => m.sessionId));
        }),
        backend.subscribeFloor(channel, (floor) => {
          const prev = prevFloorRef.current;
          prevFloorRef.current = floor;
          if (
            floor &&
            floor.sessionId !== sessionId &&
            (!prev || prev.sessionId !== floor.sessionId)
          ) {
            beepIncoming();
          }
          // Server says our hold ended (expiry/sweep) but we still think we're
          // talking → hard stop (I1/I4 win over local state).
          if (talkingRef.current && (!floor || floor.sessionId !== sessionId)) {
            stopTransmit(false);
          }
          setState((s) => ({ ...s, floor }));
        }),
        backend.subscribeInbox(sessionId, (signals: Signal[]) => {
          const fresh = signals.filter((s) => !processedSignals.current.has(s.id));
          if (fresh.length === 0) return;
          for (const sig of fresh) {
            processedSignals.current.add(sig.id);
            mesh.handleSignal(sig);
          }
          void backend.consumeSignals(fresh.map((s) => s.id));
        }),
      );

      heartbeatRef.current = window.setInterval(() => {
        // join() is an upsert — self-heals if a sweep removed us while backgrounded.
        void backend.join(sessionId, name, channel, getUserId()).catch(() => {});
      }, HEARTBEAT_MS);

      void requestWakeLock();
      setState((s) => ({
        ...s,
        screen: "channel",
        joining: false,
        sessionId,
        name,
        channel,
      }));
    },
    [requestWakeLock, stopTransmit],
  );

  const leave = useCallback(() => {
    const backend = getBackend();
    if (talkingRef.current) stopTransmit(false);
    joinedRef.current = false;
    for (const unsub of unsubsRef.current.splice(0)) unsub();
    if (heartbeatRef.current !== null) clearInterval(heartbeatRef.current);
    heartbeatRef.current = null;
    meshRef.current?.destroy();
    meshRef.current = null;
    recorderRef.current?.cancel();
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    trackRef.current = null;
    processedSignals.current.clear();
    prevFloorRef.current = null;
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
    void backend.leave(sessionIdRef.current).catch(() => {});
    setState((s) => ({
      ...initialState,
      name: s.name,
    }));
  }, [stopTransmit]);

  const pressPTT = useCallback(async () => {
    if (!joinedRef.current || pressActiveRef.current) return;
    pressActiveRef.current = true;
    meshRef.current?.retryPendingAudio();

    const { floor } = stateRef.current;
    if (floor && floor.sessionId !== sessionIdRef.current) {
      flashBusy();
      pressActiveRef.current = false;
      return;
    }

    setState((s) => ({ ...s, requesting: true }));
    let granted = false;
    try {
      const res = await getBackend().acquireFloor(
        sessionIdRef.current,
        nameRef.current,
        channelRef.current,
      );
      granted = res.granted;
    } catch {
      granted = false;
    }

    if (!pressActiveRef.current) {
      // Finger lifted while the grant was in flight — never transmit (I2).
      if (granted) {
        void getBackend().releaseFloor(sessionIdRef.current, channelRef.current);
      }
      setState((s) => ({ ...s, requesting: false }));
      return;
    }

    if (!granted) {
      flashBusy();
      setState((s) => ({ ...s, requesting: false }));
      pressActiveRef.current = false;
      return;
    }

    if (trackRef.current) trackRef.current.enabled = true;
    talkingRef.current = true;
    recorderRef.current?.start(); // I3′ — capture exactly the floor hold
    beepGrant();
    navigator.vibrate?.(30);
    setState((s) => ({ ...s, talking: true, requesting: false }));

    renewRef.current = window.setInterval(async () => {
      try {
        const { held } = await getBackend().renewFloor(
          sessionIdRef.current,
          channelRef.current,
        );
        if (!held) {
          // 60s cap hit or hold lost — force stop.
          pressActiveRef.current = false;
          stopTransmit(true);
        }
      } catch {
        // transient network error; expiry sweep is the backstop
      }
    }, FLOOR_RENEW_MS);
  }, [flashBusy, stopTransmit]);

  const releasePTT = useCallback(() => {
    if (!pressActiveRef.current) return;
    pressActiveRef.current = false;
    if (talkingRef.current) stopTransmit(true);
    else setState((s) => ({ ...s, requesting: false }));
  }, [stopTransmit]);

  // stateRef mirrors state for use inside stable callbacks.
  const stateRef = useRef(state);
  stateRef.current = state;

  // Visibility handling: iOS suspends everything when backgrounded. On return,
  // refresh presence immediately, heal the mesh, and re-acquire the wake lock.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible" || !joinedRef.current) return;
      void getBackend()
        .join(
          sessionIdRef.current,
          nameRef.current,
          channelRef.current,
          getUserId(),
        )
        .catch(() => {});
      meshRef.current?.reconcile();
      void requestWakeLock();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onVisible);
    };
  }, [requestWakeLock]);

  // Best-effort presence cleanup when the tab dies; the sweep cron is the backstop.
  useEffect(() => {
    const onPageHide = () => {
      if (joinedRef.current) {
        void getBackend().leave(sessionIdRef.current).catch(() => {});
      }
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, []);

  return { state, join, leave, pressPTT, releasePTT };
}
