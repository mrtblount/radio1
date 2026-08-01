import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { CHANNELS } from "../lib/radio/types";

interface Props {
  accessCode: string;
  joining: boolean;
  joinError: string | null;
  onPick: (channelKey: string) => void;
}

/**
 * Radio-tab channel picker for identified users: one tap goes on duty.
 * Lists the talkable team channels (seeded + custom, minus Announcements).
 */
export function ChannelSelect({ accessCode, joining, joinError, onPick }: Props) {
  const channels = useQuery(api.channels.listForRadio, {
    ...(accessCode ? { accessCode } : {}),
  });
  // Until the server list arrives, show the built-in three — same keys.
  const list =
    channels ?? CHANNELS.map((name) => ({ key: name, name }));

  return (
    <div
      className="flex h-full flex-col px-6"
      style={{ paddingTop: "max(env(safe-area-inset-top), 2rem)" }}
    >
      <header className="mb-8 mt-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="led on-rx" />
          <span
            className="silkscreen"
            style={{ fontSize: "0.65rem", color: "var(--ink-dim)" }}
          >
            two-way · ready
          </span>
        </div>
        <h1
          className="display-type font-bold leading-none"
          style={{ fontSize: "2.4rem", letterSpacing: "0.02em" }}
        >
          Go On Duty
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--ink-dim)" }}>
          Pick a channel. Hold the key. Talk.
        </p>
      </header>

      <div className="flex flex-col gap-2.5 overflow-y-auto pb-4">
        {list.map((ch, i) => (
          <button
            key={ch.key}
            type="button"
            data-testid={`channel-${ch.key}`}
            disabled={joining}
            onClick={() => onPick(ch.key)}
            className="channel-key flex items-center gap-4 rounded-md px-4 py-3.5 text-left"
          >
            <span
              className="display-type font-bold"
              style={{ fontSize: "1.1rem", color: "var(--ink-dim)" }}
            >
              CH{i + 1}
            </span>
            <span className="text-base font-medium">{ch.name}</span>
            <span
              className="silkscreen ml-auto"
              style={{ fontSize: "0.55rem", color: "var(--ink-dim)" }}
            >
              {joining ? "keying…" : "join"}
            </span>
          </button>
        ))}
      </div>

      {joinError && (
        <p
          data-testid="join-error"
          className="mb-4 rounded-md px-4 py-3 text-sm"
          style={{
            background: "color-mix(in srgb, var(--alert) 10%, transparent)",
            border: "1px solid var(--alert)",
            color: "var(--ink)",
          }}
        >
          {joinError}
        </p>
      )}

      <p className="mt-auto pb-4 text-xs" style={{ color: "var(--ink-dim)" }}>
        Joining turns the mic on standby — it transmits only while you hold the
        key.
      </p>
    </div>
  );
}
