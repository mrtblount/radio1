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
  /** "full" = the radio stage key; "mini" = the in-thread composer key. */
  size?: "full" | "mini";
}

const LABELS: Record<PTTVisualState, [string, string]> = {
  idle: ["TALK", "hold to transmit"],
  requesting: ["···", "keying up"],
  talking: ["ON AIR", "release to end"],
  busy: ["BUSY", "channel in use"],
  receiving: ["RX", "receiving"],
};

export function PTTButton({ state, onPressStart, onPressEnd, size = "full" }: Props) {
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

  if (size === "mini") {
    return (
      <button
        type="button"
        data-testid="ptt-mini"
        data-state={state}
        className="ptt-key flex shrink-0 items-center justify-center"
        style={{ width: 46, height: 46 }}
        onPointerDown={handleDown}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        onContextMenu={(e) => e.preventDefault()}
        aria-pressed={state === "talking"}
        aria-label="Push to talk"
      >
        <span
          className="display-type leading-none"
          style={{ fontSize: state === "talking" ? "0.5rem" : "0.55rem" }}
        >
          {state === "talking" ? "AIR" : state === "busy" ? "×" : "TALK"}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      data-testid="ptt-button"
      data-state={state}
      className="ptt-key flex flex-col items-center justify-center"
      style={{ width: "min(66vw, 280px)", height: "min(66vw, 280px)" }}
      onPointerDown={handleDown}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
      onContextMenu={(e) => e.preventDefault()}
      aria-pressed={state === "talking"}
      aria-label="Push to talk"
    >
      <span
        className="display-num leading-none"
        style={{ fontSize: "clamp(2.1rem, 12vw, 3.1rem)" }}
      >
        {big}
      </span>
      <span className="silkscreen mt-2" style={{ fontSize: "0.66rem", opacity: 0.75 }}>
        {small}
      </span>
    </button>
  );
}
