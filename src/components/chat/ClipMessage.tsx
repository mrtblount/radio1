import { useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { formatDuration } from "../../lib/platform/format";

interface Props {
  clipId: Id<"transmissions">;
  accessCode: string;
}

/** Playable radio transmission with its transcript, inline in the log. */
export function ClipMessage({ clipId, accessCode }: Props) {
  const clip = useQuery(api.transmissions.clip, {
    id: clipId,
    ...(accessCode ? { accessCode } : {}),
  });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);

  useEffect(
    () => () => {
      audioRef.current?.pause();
      audioRef.current = null;
    },
    [],
  );

  if (clip === undefined) {
    return (
      <p className="silkscreen mt-1" style={{ fontSize: "0.6rem", color: "var(--ink-dim)" }}>
        loading transmission…
      </p>
    );
  }
  if (clip === null || !clip.url) {
    return (
      <p className="silkscreen mt-1" style={{ fontSize: "0.6rem", color: "var(--ink-dim)" }}>
        transmission unavailable
      </p>
    );
  }

  const toggle = () => {
    if (!audioRef.current) {
      const el = new Audio(clip.url!);
      el.onended = () => setPlaying(false);
      el.onpause = () => setPlaying(false);
      el.onplay = () => setPlaying(true);
      audioRef.current = el;
    }
    if (playing) {
      audioRef.current.pause();
    } else {
      void audioRef.current.play().catch(() => setPlaying(false));
    }
  };

  return (
    <div className="mt-1.5" data-testid="clip-message">
      <div className="flex items-center gap-3">
        <button
          type="button"
          data-testid="clip-play"
          onClick={toggle}
          className="flex items-center justify-center rounded-full"
          style={{
            width: 40,
            height: 40,
            background: playing ? "var(--rx)" : "var(--panel-2)",
            border: `1px solid ${playing ? "var(--rx)" : "var(--line)"}`,
            color: playing ? "#0b0d11" : "var(--ink)",
            fontSize: "0.85rem",
            flexShrink: 0,
          }}
        >
          {playing ? "⏸" : "▶"}
        </button>
        <div className="flex items-center gap-1" aria-hidden>
          {/* static level ticks — equipment, not decoration */}
          {[3, 7, 11, 8, 5, 9, 6, 4].map((h, i) => (
            <span
              key={i}
              style={{
                width: 3,
                height: h + 4,
                borderRadius: 1,
                background: playing ? "var(--rx)" : "var(--led-off)",
              }}
            />
          ))}
        </div>
        <span
          className="silkscreen"
          style={{ fontSize: "0.62rem", color: "var(--ink-dim)" }}
        >
          {formatDuration(clip.durationMs)}
        </span>
        {(clip.transcript || clip.transcriptStatus === "pending") && (
          <button
            type="button"
            data-testid="clip-transcript-toggle"
            onClick={() => setShowTranscript((s) => !s)}
            className="silkscreen ml-auto rounded px-2 py-1"
            style={{
              fontSize: "0.55rem",
              color: showTranscript ? "var(--ink)" : "var(--ink-dim)",
              border: "1px solid var(--line)",
            }}
          >
            transcript
          </button>
        )}
      </div>
      {showTranscript && (
        <p
          data-testid="clip-transcript"
          className="mt-2 rounded px-3 py-2 text-sm leading-snug"
          style={{
            background: "var(--panel-2)",
            border: "1px solid var(--line)",
            color: clip.transcript ? "var(--ink)" : "var(--ink-dim)",
          }}
        >
          {clip.transcript ??
            (clip.transcriptStatus === "pending"
              ? "transcribing…"
              : "no transcript")}
        </p>
      )}
    </div>
  );
}
