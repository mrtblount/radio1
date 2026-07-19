import { useEffect, useRef, useState } from "react";
import type { RadioState } from "../hooks/useRadio";
import { CHANNELS } from "../lib/radio/types";
import { loadAccessCode } from "../lib/platform/identity";
import { PTTButton, type PTTVisualState } from "./PTTButton";
import { TransmissionLog } from "./radio/TransmissionLog";

export interface DirectInfo {
  otherName: string;
  onReturn: () => void;
}

interface Props {
  state: RadioState;
  sessionId: string;
  /** The radio tab is the visible tab (gates the spacebar PTT key). */
  active?: boolean;
  direct?: DirectInfo | null;
  onPressStart: () => void;
  onPressEnd: () => void;
  onLeave: () => void;
  onMessageMember?: (userId: string, name: string) => void;
  onGoDirectMember?: (userId: string, name: string) => void;
}

export function ChannelScreen({
  state,
  sessionId,
  active = true,
  direct,
  onPressStart,
  onPressEnd,
  onLeave,
  onMessageMember,
  onGoDirectMember,
}: Props) {
  const { channel, members, floor, talking, requesting, busy, peerStates } =
    state;

  const receiving = floor !== null && floor.sessionId !== sessionId;
  const channelIndex = (CHANNELS as readonly string[]).indexOf(channel);
  const [showLog, setShowLog] = useState(false);
  const [actionMember, setActionMember] = useState<{
    userId: string;
    name: string;
  } | null>(null);

  const pttState: PTTVisualState = talking
    ? "talking"
    : busy
      ? "busy"
      : requesting
        ? "requesting"
        : receiving
          ? "receiving"
          : "idle";

  // Desktop convenience: spacebar is the PTT key — only while the radio tab
  // is actually visible (never a silent transmit from chat/ops).
  useEffect(() => {
    if (!active) return;
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat && e.target === document.body) {
        e.preventDefault();
        onPressStart();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        onPressEnd();
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [active, onPressStart, onPressEnd]);

  // A press in flight is released when the tab switches away. Keyed on
  // `active` alone — parent handler identities change every render, and a
  // cleanup there would cancel live presses mid-grant.
  const onPressEndRef = useRef(onPressEnd);
  onPressEndRef.current = onPressEnd;
  useEffect(() => {
    if (!active) onPressEndRef.current();
  }, [active]);

  return (
    <div
      className="mx-auto flex h-full max-w-md flex-col px-5"
      style={{
        paddingTop: "max(env(safe-area-inset-top), 1.25rem)",
        // The shell's tab bar owns the bottom safe area now.
        paddingBottom: "0.75rem",
      }}
    >
      {/* Top plate: channel + status lamps */}
      <header
        className="flex items-center justify-between rounded-md px-4 py-3"
        style={{ background: "var(--panel)", border: "1px solid var(--line)" }}
      >
        <div>
          <div className="silkscreen" style={{ fontSize: "0.6rem", color: direct ? "var(--rx)" : "var(--ink-dim)" }}>
            {direct
              ? "direct · private"
              : channelIndex >= 0
                ? `channel ${String(channelIndex + 1).padStart(2, "0")}`
                : "team channel"}
          </div>
          <div className="display-type font-bold" style={{ fontSize: "1.5rem" }} data-testid="channel-title">
            {direct ? direct.otherName : channel}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-center gap-1">
            <span className={`led ${talking ? "on-tx" : ""}`} />
            <span className="silkscreen" style={{ fontSize: "0.5rem", color: "var(--ink-dim)" }}>
              tx
            </span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className={`led ${receiving ? "on-rx rx-blink" : ""}`} />
            <span className="silkscreen" style={{ fontSize: "0.5rem", color: "var(--ink-dim)" }}>
              rx
            </span>
          </div>
          <button
            type="button"
            data-testid="log-button"
            onClick={() => setShowLog(true)}
            className="silkscreen rounded px-3 py-2"
            style={{
              fontSize: "0.65rem",
              color: "var(--ink-dim)",
              border: "1px solid var(--line)",
            }}
          >
            log
          </button>
          {direct ? (
            <button
              type="button"
              data-testid="direct-return"
              onClick={direct.onReturn}
              className="silkscreen rounded px-3 py-2"
              style={{
                fontSize: "0.65rem",
                color: "#141414",
                background: "var(--rx)",
                border: "1px solid var(--line)",
              }}
            >
              return
            </button>
          ) : (
            <button
              type="button"
              data-testid="leave-button"
              onClick={onLeave}
              className="silkscreen rounded px-3 py-2"
              style={{
                fontSize: "0.65rem",
                color: "var(--ink-dim)",
                border: "1px solid var(--line)",
              }}
            >
              off duty
            </button>
          )}
        </div>
      </header>

      {/* Now-speaking readout */}
      <div
        className="mt-3 flex min-h-14 items-center justify-center rounded-md px-4"
        style={{
          background: receiving || talking ? "rgba(70,224,138,0.06)" : "var(--panel)",
          border: `1px solid ${
            talking ? "var(--tx)" : receiving ? "var(--rx)" : "var(--line)"
          }`,
        }}
        data-testid="now-speaking"
      >
        {talking ? (
          <span className="display-type font-bold" style={{ color: "var(--tx)", fontSize: "1.1rem" }}>
            ● ON AIR — {direct ? `DIRECT TO ${direct.otherName.toUpperCase()}` : "CHANNEL IS YOURS"}
          </span>
        ) : receiving ? (
          <span
            className="display-type font-bold"
            style={{ color: "var(--rx)", fontSize: "1.1rem" }}
            data-testid="receiving-banner"
          >
            ▶ {floor!.name} TRANSMITTING
          </span>
        ) : (
          <span className="silkscreen" style={{ fontSize: "0.7rem", color: "var(--ink-dim)" }}>
            {direct ? "private line — clear" : "monitoring — channel clear"}
          </span>
        )}
      </div>

      {/* Roster */}
      <section className="mt-3 flex-1 overflow-y-auto">
        <div className="silkscreen mb-2" style={{ fontSize: "0.6rem", color: "var(--ink-dim)" }}>
          {direct ? "on this line" : "on duty"} · {members.length}
        </div>
        <ul className="flex flex-col gap-1.5">
          {members.map((m) => {
            const isMe = m.sessionId === sessionId;
            const isTalking = floor?.sessionId === m.sessionId;
            const conn = isMe ? "connected" : peerStates[m.sessionId];
            const tappable = !isMe && !!m.userId && !direct;
            return (
              <li
                key={m.sessionId}
                data-testid="roster-member"
                onClick={
                  tappable
                    ? () => setActionMember({ userId: m.userId!, name: m.name })
                    : undefined
                }
                className="flex items-center gap-3 rounded-md px-3.5 py-2.5"
                style={{
                  background: "var(--panel)",
                  border: `1px solid ${isTalking ? "var(--rx)" : "var(--line)"}`,
                  cursor: tappable ? "pointer" : undefined,
                }}
              >
                <span
                  className={`led ${
                    isTalking
                      ? "on-rx rx-blink"
                      : conn === "connected"
                        ? "on-rx"
                        : conn === "failed"
                          ? "on-alert"
                          : ""
                  }`}
                />
                <span className="text-base font-medium">
                  {m.name}
                  {isMe && (
                    <span className="ml-2 text-xs" style={{ color: "var(--ink-dim)" }}>
                      (you)
                    </span>
                  )}
                </span>
                {conn === "failed" && !isMe && (
                  <span className="silkscreen ml-auto" style={{ fontSize: "0.55rem", color: "var(--alert)" }}>
                    no link
                  </span>
                )}
                {conn === "connecting" && !isMe && (
                  <span className="silkscreen ml-auto" style={{ fontSize: "0.55rem", color: "var(--ink-dim)" }}>
                    linking…
                  </span>
                )}
                {tappable && conn === "connected" && (
                  <span className="silkscreen ml-auto" style={{ fontSize: "0.55rem", color: "var(--ink-dim)" }}>
                    ›
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* The key */}
      <div className="flex flex-col items-center pb-2 pt-4">
        <PTTButton
          state={pttState}
          onPressStart={onPressStart}
          onPressEnd={onPressEnd}
        />
        <p className="silkscreen mt-4" style={{ fontSize: "0.6rem", color: "var(--ink-dim)" }}>
          keep screen on while on duty
        </p>
      </div>

      <TransmissionLog
        open={showLog}
        channel={channel}
        accessCode={loadAccessCode()}
        onClose={() => setShowLog(false)}
      />

      {/* Roster member actions */}
      {actionMember && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={() => setActionMember(null)}
        >
          <div
            className="w-full max-w-md rounded-t-xl px-5 pt-4"
            style={{
              background: "var(--panel)",
              border: "1px solid var(--line)",
              paddingBottom: "max(env(safe-area-inset-bottom), 2rem)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="mx-auto mb-4 h-1 w-10 rounded-full"
              style={{ background: "var(--line)" }}
            />
            <div className="mb-3 flex items-center gap-2">
              <span className="led on-rx" />
              <span className="text-base font-medium">{actionMember.name}</span>
              <span className="silkscreen" style={{ fontSize: "0.5rem", color: "var(--ink-dim)" }}>
                on duty
              </span>
            </div>
            <div className="mb-2 flex gap-2">
              {onGoDirectMember && (
                <button
                  type="button"
                  data-testid="roster-go-direct"
                  onClick={() => {
                    onGoDirectMember(actionMember.userId, actionMember.name);
                    setActionMember(null);
                  }}
                  className="display-type flex-1 rounded-md py-3.5 font-bold"
                  style={{
                    fontSize: "1rem",
                    letterSpacing: "0.06em",
                    background: "var(--rx)",
                    color: "#0b0d11",
                  }}
                >
                  GO DIRECT
                </button>
              )}
              {onMessageMember && (
                <button
                  type="button"
                  data-testid="roster-message"
                  onClick={() => {
                    onMessageMember(actionMember.userId, actionMember.name);
                    setActionMember(null);
                  }}
                  className="display-type flex-1 rounded-md py-3.5 font-bold"
                  style={{
                    fontSize: "1rem",
                    letterSpacing: "0.06em",
                    background: "var(--panel-2)",
                    color: "var(--ink)",
                    border: "1px solid var(--line)",
                  }}
                >
                  MESSAGE
                </button>
              )}
            </div>
            <p className="pb-1 text-xs" style={{ color: "var(--ink-dim)" }}>
              GO DIRECT opens a private line — the channel won't hear it.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
