import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { formatDuration } from "../../lib/platform/format";
import { getUserId } from "../../lib/platform/identity";

// One clip plays at a time, app-wide — starting a clip pauses the previous one.
let currentClipAudio: HTMLAudioElement | null = null;

interface Props {
  clipId: Id<"transmissions">;
  accessCode: string;
}

/** Playable radio transmission with its transcript, inline in the log. */
export function ClipMessage({ clipId, accessCode }: Props) {
  const myId = getUserId();
  const codeArg = accessCode ? { accessCode } : {};
  const clip = useQuery(api.transmissions.clip, {
    id: clipId,
    userId: myId,
    ...codeArg,
  });
  const ackClip = useMutation(api.transmissions.ack);
  const addFromTransmission = useMutation(api.tasks.addFromTransmission);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [tasked, setTasked] = useState(false);

  useEffect(
    () => () => {
      audioRef.current?.pause();
      if (currentClipAudio === audioRef.current) currentClipAudio = null;
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

  const mine = clip.senderUserId === myId;
  const isDm = clip.channelKey.startsWith("dm_");
  const acks = clip.acks ?? [];
  const ackedByMe = acks.some((a) => a.userId === myId);

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
      if (currentClipAudio && currentClipAudio !== audioRef.current) {
        currentClipAudio.pause();
      }
      currentClipAudio = audioRef.current;
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
          <div className="ml-auto flex items-center gap-1.5">
            {clip.transcriptConfidence === "low" && clip.transcript && (
              <span
                data-testid="clip-lowconf"
                className="silkscreen rounded px-1.5 py-0.5"
                style={{
                  fontSize: "0.5rem",
                  color: "var(--tx)",
                  border: "1px solid var(--tx)",
                }}
              >
                low conf
              </span>
            )}
            <button
              type="button"
              data-testid="clip-transcript-toggle"
              onClick={() => setShowTranscript((s) => !s)}
              className="silkscreen rounded px-2 py-1"
              style={{
                fontSize: "0.55rem",
                color: showTranscript ? "var(--ink)" : "var(--ink-dim)",
                border: "1px solid var(--line)",
              }}
            >
              transcript
            </button>
          </div>
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
      {(!mine || !isDm || acks.length > 0) && (
        <div className="mt-1.5 flex min-w-0 items-center gap-2">
          {!mine && (
            <button
              type="button"
              data-testid="clip-ack"
              onClick={() => {
                void ackClip({ id: clipId, userId: myId, ...codeArg }).catch(
                  () => {},
                );
              }}
              className="silkscreen rounded px-2.5 py-1.5"
              style={{
                fontSize: "0.55rem",
                background: ackedByMe ? "var(--tx)" : "transparent",
                color: ackedByMe ? "#141414" : "var(--ink-dim)",
                border: `1px solid ${ackedByMe ? "var(--tx)" : "var(--line)"}`,
              }}
            >
              copy
            </button>
          )}
          {!isDm && (
            <button
              type="button"
              data-testid="clip-task"
              disabled={tasked}
              onClick={() => {
                void addFromTransmission({
                  transmissionId: clipId,
                  userId: myId,
                  ...codeArg,
                })
                  .then(() => setTasked(true))
                  .catch(() => {});
              }}
              className="silkscreen rounded px-2.5 py-1.5"
              style={{
                fontSize: "0.55rem",
                color: tasked ? "var(--rx)" : "var(--ink-dim)",
                border: `1px solid ${tasked ? "var(--rx)" : "var(--line)"}`,
              }}
            >
              {tasked ? "tasked ✓" : "→ task"}
            </button>
          )}
          {acks.length > 0 && (
            <span
              data-testid="clip-ack-names"
              className="silkscreen ml-auto min-w-0 truncate"
              style={{ fontSize: "0.55rem", color: "var(--rx)" }}
            >
              copy: {acks.map((a) => a.name).join(" · ")}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
