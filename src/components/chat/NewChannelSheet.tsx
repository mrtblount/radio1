import { useState } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
}

export function NewChannelSheet({ open, onClose, onCreate }: Props) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center"
      style={{ background: "rgba(27,26,30,0.45)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-xl px-5 pb-8 pt-4"
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
        <div className="silkscreen mb-3" style={{ fontSize: "0.65rem", color: "var(--ink-dim)" }}>
          new channel
        </div>
        <input
          data-testid="new-channel-name"
          value={name}
          autoFocus
          maxLength={32}
          placeholder="e.g. Ushers"
          onChange={(e) => setName(e.target.value)}
          className="mb-3 w-full rounded-md px-4 py-3 text-lg outline-none"
          style={{
            background: "var(--panel-2)",
            border: "1px solid var(--line)",
            color: "var(--ink)",
          }}
        />
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
            void onCreate(name.trim())
              .then(() => {
                setName("");
                onClose();
              })
              .catch((e: unknown) =>
                setError(e instanceof Error ? e.message : "Couldn't create channel"),
              )
              .finally(() => setBusy(false));
          }}
          className="display-type w-full rounded-md py-3.5 font-bold"
          style={{
            fontSize: "1.1rem",
            letterSpacing: "0.06em",
            background: name.trim().length >= 2 && !busy ? "var(--tx)" : "var(--panel-2)",
            color: name.trim().length >= 2 && !busy ? "#f7f5f0" : "var(--ink-dim)",
          }}
        >
          {busy ? "CREATING…" : "CREATE CHANNEL"}
        </button>
      </div>
    </div>
  );
}
