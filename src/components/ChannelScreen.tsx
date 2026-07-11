import { useEffect } from "react";
import type { RadioState } from "../hooks/useRadio";
import { CHANNELS } from "../lib/radio/types";
import { PTTButton, type PTTVisualState } from "./PTTButton";

interface Props {
  state: RadioState;
  sessionId: string;
  onPressStart: () => void;
  onPressEnd: () => void;
  onLeave: () => void;
}

export function ChannelScreen({
  state,
  sessionId,
  onPressStart,
  onPressEnd,
  onLeave,
}: Props) {
  const { channel, members, floor, talking, requesting, busy, peerStates } =
    state;

  const receiving = floor !== null && floor.sessionId !== sessionId;
  const channelNumber = Math.max(1, CHANNELS.indexOf(channel as never) + 1);

  const pttState: PTTVisualState = talking
    ? "talking"
    : busy
      ? "busy"
      : requesting
        ? "requesting"
        : receiving
          ? "receiving"
          : "idle";

  // Desktop convenience: spacebar is the PTT key.
  useEffect(() => {
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
  }, [onPressStart, onPressEnd]);

  return (
    <div
      className="mx-auto flex h-full max-w-md flex-col px-5"
      style={{
        paddingTop: "max(env(safe-area-inset-top), 1.25rem)",
        paddingBottom: "max(env(safe-area-inset-bottom), 1.25rem)",
      }}
    >
      {/* Top plate: channel + status lamps */}
      <header
        className="flex items-center justify-between rounded-md px-4 py-3"
        style={{ background: "var(--panel)", border: "1px solid var(--line)" }}
      >
        <div>
          <div className="silkscreen" style={{ fontSize: "0.6rem", color: "var(--ink-dim)" }}>
            channel {String(channelNumber).padStart(2, "0")}
          </div>
          <div className="display-type font-bold" style={{ fontSize: "1.5rem" }}>
            {channel}
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
            ● ON AIR — CHANNEL IS YOURS
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
            monitoring — channel clear
          </span>
        )}
      </div>

      {/* Roster */}
      <section className="mt-3 flex-1 overflow-y-auto">
        <div className="silkscreen mb-2" style={{ fontSize: "0.6rem", color: "var(--ink-dim)" }}>
          on duty · {members.length}
        </div>
        <ul className="flex flex-col gap-1.5">
          {members.map((m) => {
            const isMe = m.sessionId === sessionId;
            const isTalking = floor?.sessionId === m.sessionId;
            const conn = isMe ? "connected" : peerStates[m.sessionId];
            return (
              <li
                key={m.sessionId}
                data-testid="roster-member"
                className="flex items-center gap-3 rounded-md px-3.5 py-2.5"
                style={{
                  background: "var(--panel)",
                  border: `1px solid ${isTalking ? "var(--rx)" : "var(--line)"}`,
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
    </div>
  );
}
