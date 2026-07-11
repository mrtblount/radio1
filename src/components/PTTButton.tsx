import { useCallback, useRef } from "react";

export type PTTVisualState =
  | "idle"
  | "requesting"
  | "talking"
  | "busy"
  | "receiving";

interface Props {
  state: PTTVisualState;
  onPressStart: () => void;
  onPressEnd: () => void;
}

const LABELS: Record<PTTVisualState, [string, string]> = {
  idle: ["TALK", "hold to transmit"],
  requesting: ["···", "keying up"],
  talking: ["ON AIR", "release to end"],
  busy: ["BUSY", "channel in use"],
  receiving: ["RX", "receiving"],
};

export function PTTButton({ state, onPressStart, onPressEnd }: Props) {
  const pointerIdRef = useRef<number | null>(null);

  const handleDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (pointerIdRef.current !== null) return; // second finger — ignore
      pointerIdRef.current = e.pointerId;
      e.currentTarget.setPointerCapture(e.pointerId);
      onPressStart();
    },
    [onPressStart],
  );

  const handleUp = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (pointerIdRef.current !== e.pointerId) return;
      pointerIdRef.current = null;
      onPressEnd();
    },
    [onPressEnd],
  );

  const [big, small] = LABELS[state];

  return (
    <button
      type="button"
      data-testid="ptt-button"
      data-state={state}
      className="ptt-key flex flex-col items-center justify-center"
      style={{ width: "min(72vw, 300px)", height: "min(72vw, 300px)" }}
      onPointerDown={handleDown}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
      onContextMenu={(e) => e.preventDefault()}
      aria-pressed={state === "talking"}
      aria-label="Push to talk"
    >
      <span
        className="display-type font-bold leading-none"
        style={{
          fontSize: "clamp(2.2rem, 13vw, 3.4rem)",
          color:
            state === "talking"
              ? "var(--tx)"
              : state === "busy"
                ? "var(--alert)"
                : state === "receiving"
                  ? "var(--rx)"
                  : "var(--ink)",
        }}
      >
        {big}
      </span>
      <span
        className="silkscreen mt-2"
        style={{ fontSize: "0.7rem", color: "var(--ink-dim)" }}
      >
        {small}
      </span>
    </button>
  );
}
