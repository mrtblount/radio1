import { useEffect, useState } from "react";
import { getBackend } from "../lib/radio/convexBackend";
import { loadAccessCode, loadDisplayName } from "../lib/radio/session";
import { CHANNELS } from "../lib/radio/types";
import { channelSlab } from "../lib/platform/palette";

interface Props {
  joining: boolean;
  joinError: string | null;
  onJoin: (name: string, channel: string, accessCode: string) => void;
  /** Optional: pass the gate without going on the radio (text chat only). */
  onChatOnly?: (name: string, accessCode: string) => Promise<string | null>;
  /** Pre-flight call-sign availability (D22). Resolve false = name in use. */
  checkName?: (name: string, accessCode: string) => Promise<boolean>;
}

export function JoinScreen({
  joining,
  joinError,
  onJoin,
  onChatOnly,
  checkName,
}: Props) {
  const [name, setName] = useState(loadDisplayName);
  const [channel, setChannel] = useState<string>(CHANNELS[0]);
  const [code, setCode] = useState(loadAccessCode);
  const [codeRequired, setCodeRequired] = useState(false);
  const [chatOnlyBusy, setChatOnlyBusy] = useState(false);
  const [chatOnlyError, setChatOnlyError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const ready =
    name.trim().length >= 2 && (!codeRequired || code.trim().length > 0);

  const guardName = async (): Promise<boolean> => {
    if (!checkName) return true;
    setChecking(true);
    try {
      const ok = await checkName(name.trim(), code.trim());
      if (!ok) {
        setNameError("That call sign is in use on this team. Pick another.");
        return false;
      }
      return true;
    } catch {
      // Offline or bad code — let the join path surface the real error.
      return true;
    } finally {
      setChecking(false);
    }
  };

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
      className="mx-auto flex h-full max-w-md flex-col overflow-y-auto px-6"
      style={{ paddingTop: "max(env(safe-area-inset-top), 2.5rem)" }}
    >
      <header className="mb-10 mt-6">
        <div className="mb-3 flex items-center gap-2">
          <span className="led on-rx" />
          <span className="silkscreen" style={{ fontSize: "0.65rem", color: "var(--ink-dim)" }}>
            two-way · ready
          </span>
        </div>
        <h1 className="display-num" style={{ fontSize: "4.4rem" }}>
          RELAY
        </h1>
        <div
          className="mt-1 h-[6px] w-24 rounded-full"
          style={{ background: "var(--coral)" }}
        />
        <p className="mt-4 text-[15px]" style={{ color: "var(--ink-dim)" }}>
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
        className="mb-8 w-full rounded-2xl px-5 py-3.5 text-lg outline-none"
        style={{
          background: "var(--surface)",
          border: "1.5px solid var(--line)",
          color: "var(--ink)",
          fontFamily: "var(--body)",
        }}
      />

      <label className="silkscreen mb-2 block" style={{ fontSize: "0.65rem", color: "var(--ink-dim)" }}>
        Channel
      </label>
      <div className="mb-10 flex flex-col gap-2.5">
        {CHANNELS.map((ch, i) => {
          const selected = channel === ch;
          return (
            <button
              key={ch}
              type="button"
              data-testid={`channel-${ch}`}
              data-selected={selected}
              onClick={() => setChannel(ch)}
              className={`flex items-center gap-4 px-5 py-4 text-left transition-transform active:translate-y-[2px] ${
                selected ? `slab ${channelSlab(ch)}` : "channel-key"
              }`}
            >
              <span
                className="display-num"
                style={{
                  fontSize: "1.3rem",
                  opacity: selected ? 1 : 0.5,
                }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="text-base font-semibold">{ch}</span>
              {selected && (
                <span
                  className="silkscreen ml-auto"
                  style={{ fontSize: "0.6rem", opacity: 0.85 }}
                >
                  selected
                </span>
              )}
            </button>
          );
        })}
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
            className="mb-8 w-full rounded-2xl px-5 py-3.5 text-lg outline-none"
            style={{
              background: "var(--surface)",
              border: "1.5px solid var(--line)",
              color: "var(--ink)",
              fontFamily: "var(--body)",
              letterSpacing: "0.2em",
            }}
          />
        </>
      )}

      {(joinError || chatOnlyError || nameError) && (
        <p
          data-testid="join-error"
          className="mb-4 rounded-md px-4 py-3 text-sm"
          style={{ background: "color-mix(in srgb, var(--alert) 10%, transparent)", border: "1px solid var(--alert)", color: "var(--ink)" }}
        >
          {nameError ?? joinError ?? chatOnlyError}
        </p>
      )}

      <button
        type="button"
        data-testid="join-button"
        disabled={!ready || joining || checking}
        onClick={() => {
          setNameError(null);
          void guardName().then((ok) => {
            if (ok) onJoin(name.trim(), channel, code.trim());
          });
        }}
        className="display-type mb-4 w-full rounded-full py-4"
        style={{
          fontSize: "1.25rem",
          letterSpacing: "0.06em",
          border: "none",
          cursor: "pointer",
          background: ready && !joining ? "var(--ink)" : "var(--surface-2)",
          color: ready && !joining ? "var(--canvas)" : "var(--ink-faint)",
          transition: "background 120ms ease, transform 80ms ease",
        }}
      >
        {joining || checking ? "KEYING IN…" : "GO ON DUTY"}
      </button>

      {onChatOnly && (
        <button
          type="button"
          data-testid="chat-only-link"
          disabled={!ready || joining || chatOnlyBusy}
          onClick={() => {
            setChatOnlyBusy(true);
            setChatOnlyError(null);
            setNameError(null);
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
