import { useEffect, useState } from "react";
import { getBackend } from "../lib/radio/convexBackend";
import { loadAccessCode, loadDisplayName } from "../lib/radio/session";
import { CHANNELS } from "../lib/radio/types";

interface Props {
  joining: boolean;
  joinError: string | null;
  onJoin: (name: string, channel: string, accessCode: string) => void;
  /** Optional: pass the gate without going on the radio (text chat only). */
  onChatOnly?: (name: string, accessCode: string) => Promise<string | null>;
}

export function JoinScreen({ joining, joinError, onJoin, onChatOnly }: Props) {
  const [name, setName] = useState(loadDisplayName);
  const [channel, setChannel] = useState<string>(CHANNELS[0]);
  const [code, setCode] = useState(loadAccessCode);
  const [codeRequired, setCodeRequired] = useState(false);
  const [chatOnlyBusy, setChatOnlyBusy] = useState(false);
  const [chatOnlyError, setChatOnlyError] = useState<string | null>(null);
  const ready =
    name.trim().length >= 2 && (!codeRequired || code.trim().length > 0);

  useEffect(() => {
    let cancelled = false;
    getBackend()
      .codeRequired()
      .then((required) => {
        if (!cancelled) setCodeRequired(required);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      className="mx-auto flex h-full max-w-md flex-col px-6"
      style={{ paddingTop: "max(env(safe-area-inset-top), 2.5rem)" }}
    >
      <header className="mb-10 mt-6">
        <div className="mb-2 flex items-center gap-2">
          <span className="led on-rx" />
          <span className="silkscreen" style={{ fontSize: "0.65rem", color: "var(--ink-dim)" }}>
            two-way · ready
          </span>
        </div>
        <h1
          className="display-type font-bold leading-none"
          style={{ fontSize: "3.2rem", letterSpacing: "0.02em" }}
        >
          Team Radio
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--ink-dim)" }}>
          Hold the key. Talk. The whole channel hears you.
        </p>
      </header>

      <label className="silkscreen mb-2 block" style={{ fontSize: "0.65rem", color: "var(--ink-dim)" }}>
        Call sign / name
      </label>
      <input
        data-testid="name-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Tony"
        maxLength={24}
        autoComplete="off"
        className="mb-8 w-full rounded-md px-4 py-3.5 text-lg outline-none"
        style={{
          background: "var(--panel)",
          border: "1px solid var(--line)",
          color: "var(--ink)",
          fontFamily: "var(--body)",
        }}
      />

      <label className="silkscreen mb-2 block" style={{ fontSize: "0.65rem", color: "var(--ink-dim)" }}>
        Channel
      </label>
      <div className="mb-10 flex flex-col gap-2.5">
        {CHANNELS.map((ch, i) => (
          <button
            key={ch}
            type="button"
            data-testid={`channel-${ch}`}
            data-selected={channel === ch}
            onClick={() => setChannel(ch)}
            className="channel-key flex items-center gap-4 rounded-md px-4 py-3.5 text-left"
          >
            <span
              className="display-type font-bold"
              style={{
                fontSize: "1.1rem",
                color: channel === ch ? "var(--tx)" : "var(--ink-dim)",
              }}
            >
              CH{i + 1}
            </span>
            <span className="text-base font-medium">{ch}</span>
          </button>
        ))}
      </div>

      {codeRequired && (
        <>
          <label
            className="silkscreen mb-2 block"
            style={{ fontSize: "0.65rem", color: "var(--ink-dim)" }}
          >
            Access code
          </label>
          <input
            data-testid="code-input"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Ask your team lead"
            maxLength={32}
            autoComplete="off"
            inputMode="numeric"
            className="mb-8 w-full rounded-md px-4 py-3.5 text-lg outline-none"
            style={{
              background: "var(--panel)",
              border: "1px solid var(--line)",
              color: "var(--ink)",
              fontFamily: "var(--body)",
              letterSpacing: "0.2em",
            }}
          />
        </>
      )}

      {(joinError || chatOnlyError) && (
        <p
          data-testid="join-error"
          className="mb-4 rounded-md px-4 py-3 text-sm"
          style={{ background: "rgba(255,81,71,0.1)", border: "1px solid var(--alert)", color: "var(--ink)" }}
        >
          {joinError ?? chatOnlyError}
        </p>
      )}

      <button
        type="button"
        data-testid="join-button"
        disabled={!ready || joining}
        onClick={() => onJoin(name.trim(), channel, code.trim())}
        className="display-type mb-4 w-full rounded-md py-4 font-bold"
        style={{
          fontSize: "1.3rem",
          letterSpacing: "0.08em",
          background: ready && !joining ? "var(--tx)" : "var(--panel-2)",
          color: ready && !joining ? "#141414" : "var(--ink-dim)",
          transition: "background 120ms ease",
        }}
      >
        {joining ? "KEYING IN…" : "GO ON DUTY"}
      </button>

      {onChatOnly && (
        <button
          type="button"
          data-testid="chat-only-link"
          disabled={!ready || joining || chatOnlyBusy}
          onClick={() => {
            setChatOnlyBusy(true);
            setChatOnlyError(null);
            void onChatOnly(name.trim(), code.trim()).then((err) => {
              setChatOnlyBusy(false);
              if (err) setChatOnlyError(err);
            });
          }}
          className="silkscreen mb-6 w-full py-2"
          style={{
            fontSize: "0.62rem",
            color: ready ? "var(--ink-dim)" : "var(--led-off)",
            background: "none",
            border: "none",
          }}
        >
          {chatOnlyBusy ? "opening…" : "open text chat without radio →"}
        </button>
      )}

      <p className="mt-auto pb-6 text-xs" style={{ color: "var(--ink-dim)" }}>
        Your phone will ask for microphone access — that's the radio.
      </p>
    </div>
  );
}
