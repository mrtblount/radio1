import { useEffect, useState } from "react";

export type ChannelMode = "ptt" | "text";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, mode: ChannelMode) => Promise<void>;
}

const MODES: Array<{
  mode: ChannelMode;
  slab: string;
  title: string;
  blurb: string;
}> = [
  {
    mode: "ptt",
    slab: "slab-coral",
    title: "Push-to-talk",
    blurb: "A live radio channel. Hold the key, talk, everyone hears you — with chat underneath.",
  },
  {
    mode: "text",
    slab: "slab-ink",
    title: "Text channel",
    blurb: "Chat-first, no radio. For threads that read better than they sound.",
  },
];

export function NewChannelSheet({ open, onClose, onCreate }: Props) {
  const [name, setName] = useState("");
  const [mode, setMode] = useState<ChannelMode>("ptt");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center md:items-center"
      style={{ background: "rgba(27,26,30,0.45)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl px-5 pt-4 md:rounded-3xl"
        style={{
          background: "var(--surface)",
          border: "1.5px solid var(--line)",
          paddingBottom: "max(env(safe-area-inset-bottom), 2rem)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="mx-auto mb-4 h-1 w-10 rounded-full md:hidden"
          style={{ background: "var(--line-strong)" }}
        />
        <div className="display-num mb-4" style={{ fontSize: "1.6rem" }}>
          NEW CHANNEL
        </div>
        <input
          data-testid="new-channel-name"
          value={name}
          autoFocus
          maxLength={32}
          placeholder="e.g. Ushers"
          onChange={(e) => setName(e.target.value)}
          className="mb-4 w-full rounded-2xl px-4 py-3 text-lg outline-none"
          style={{
            background: "var(--surface-2)",
            border: "1.5px solid transparent",
            color: "var(--ink)",
          }}
        />

        <div className="mb-4 flex flex-col gap-2.5">
          {MODES.map((m) => {
            const selected = mode === m.mode;
            return (
              <button
                key={m.mode}
                type="button"
                data-testid={`channel-mode-${m.mode}`}
                onClick={() => setMode(m.mode)}
                className={`${selected ? `slab ${m.slab}` : "channel-key"} px-4 py-3.5 text-left transition-transform active:translate-y-[2px]`}
                style={{ border: selected ? "none" : undefined, cursor: "pointer" }}
              >
                <div className="flex items-center gap-2">
                  <span className="display-type" style={{ fontSize: "0.95rem" }}>
                    {m.title}
                  </span>
                  {selected && (
                    <span className="silkscreen ml-auto" style={{ fontSize: "0.55rem", opacity: 0.85 }}>
                      selected
                    </span>
                  )}
                </div>
                <p
                  className="mt-1 text-[0.8rem] leading-snug"
                  style={{ opacity: selected ? 0.9 : 0.65 }}
                >
                  {m.blurb}
                </p>
              </button>
            );
          })}
        </div>

        {error && (
          <p className="mb-3 text-sm" style={{ color: "var(--alert)" }}>
            {error}
          </p>
        )}
        <button
          type="button"
          data-testid="new-channel-create"
          disabled={name.trim().length < 2 || busy}
          onClick={() => {
            setBusy(true);
            setError(null);
            void onCreate(name.trim(), mode)
              .then(() => {
                setName("");
                onClose();
              })
              .catch((e: unknown) =>
                setError(e instanceof Error ? e.message : "Couldn't create channel"),
              )
              .finally(() => setBusy(false));
          }}
          className="display-type w-full rounded-full py-3.5"
          style={{
            fontSize: "1.05rem",
            letterSpacing: "0.05em",
            border: "none",
            cursor: "pointer",
            background: name.trim().length >= 2 && !busy ? "var(--ink)" : "var(--surface-2)",
            color: name.trim().length >= 2 && !busy ? "var(--canvas)" : "var(--ink-faint)",
          }}
        >
          {busy ? "CREATING…" : "CREATE CHANNEL"}
        </button>
      </div>
    </div>
  );
}
