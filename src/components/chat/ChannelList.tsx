import { formatTime } from "../../lib/platform/format";

export interface TeamChannelRow {
  key: string;
  name: string;
  postRestricted: boolean;
  unread: number;
  last: { name: string; body: string; kind: string; createdAt: number } | null;
}

export interface DmRow {
  key: string;
  otherUserId: string;
  name: string;
  online: boolean;
  unread: number;
  last: { name: string; body: string; kind: string; createdAt: number } | null;
}

interface Props {
  team: TeamChannelRow[];
  dms: DmRow[];
  onOpenTeam: (channel: TeamChannelRow) => void;
  onOpenDm: (dm: DmRow) => void;
  onNewChannel: () => void;
  onDirectMessage: () => void;
}

function preview(
  last: { name: string; body: string; kind: string } | null,
): string {
  if (!last) return "";
  if (last.kind === "clip") return `▶ ${last.name} transmission`;
  return `${last.name}: ${last.body}`;
}

export function ChannelList({
  team,
  dms,
  onOpenTeam,
  onOpenDm,
  onNewChannel,
  onDirectMessage,
}: Props) {
  return (
    <div className="flex h-full flex-col">
      <header
        className="flex items-center justify-between px-4 py-3"
        style={{ paddingTop: "max(env(safe-area-inset-top), 1.25rem)" }}
      >
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="led on-rx" />
            <span
              className="silkscreen"
              style={{ fontSize: "0.6rem", color: "var(--ink-dim)" }}
            >
              team net · live
            </span>
          </div>
          <h1 className="display-type font-bold leading-none" style={{ fontSize: "2rem" }}>
            Chat
          </h1>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            data-testid="new-dm"
            onClick={onDirectMessage}
            className="silkscreen rounded px-3 py-2"
            style={{
              fontSize: "0.62rem",
              color: "var(--ink-dim)",
              border: "1px solid var(--line)",
            }}
          >
            direct
          </button>
          <button
            type="button"
            data-testid="new-channel"
            onClick={onNewChannel}
            className="silkscreen rounded px-3 py-2"
            style={{
              fontSize: "0.62rem",
              color: "var(--ink-dim)",
              border: "1px solid var(--line)",
            }}
          >
            + channel
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <div
          className="silkscreen mb-2 mt-1"
          style={{ fontSize: "0.6rem", color: "var(--ink-dim)" }}
        >
          channels
        </div>
        <ul className="flex flex-col gap-1.5">
          {team.map((c) => (
            <li key={c.key}>
              <button
                type="button"
                data-testid={`chat-channel-${c.key}`}
                onClick={() => onOpenTeam(c)}
                className="flex w-full items-center gap-3 rounded-md px-3.5 py-3 text-left"
                style={{
                  background: "var(--panel)",
                  border: `1px solid ${c.unread > 0 ? "var(--rx)" : "var(--line)"}`,
                }}
              >
                <span className={`led ${c.unread > 0 ? "on-rx rx-blink" : ""}`} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="text-base font-medium">{c.name}</span>
                    {c.postRestricted && (
                      <span
                        className="silkscreen"
                        style={{ fontSize: "0.5rem", color: "var(--tx)" }}
                      >
                        official
                      </span>
                    )}
                    {c.last && (
                      <span
                        className="ml-auto shrink-0"
                        style={{ fontSize: "0.62rem", color: "var(--ink-dim)" }}
                      >
                        {formatTime(c.last.createdAt)}
                      </span>
                    )}
                  </span>
                  <span
                    className="block truncate text-xs"
                    style={{ color: "var(--ink-dim)" }}
                  >
                    {preview(c.last) || "channel clear"}
                  </span>
                </span>
                {c.unread > 0 && (
                  <span
                    className="silkscreen rounded-full px-2 py-0.5"
                    data-testid="unread-badge"
                    style={{
                      fontSize: "0.6rem",
                      background: "var(--rx)",
                      color: "#0b0d11",
                    }}
                  >
                    {c.unread}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>

        <div
          className="silkscreen mb-2 mt-5"
          style={{ fontSize: "0.6rem", color: "var(--ink-dim)" }}
        >
          direct
        </div>
        {dms.length === 0 ? (
          <p className="text-xs" style={{ color: "var(--ink-dim)" }}>
            No direct messages yet — hit DIRECT to reach one person.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {dms.map((d) => (
              <li key={d.key}>
                <button
                  type="button"
                  data-testid={`chat-dm-${d.otherUserId}`}
                  onClick={() => onOpenDm(d)}
                  className="flex w-full items-center gap-3 rounded-md px-3.5 py-3 text-left"
                  style={{
                    background: "var(--panel)",
                    border: `1px solid ${d.unread > 0 ? "var(--rx)" : "var(--line)"}`,
                  }}
                >
                  <span className={`led ${d.online ? "on-rx" : ""}`} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="text-base font-medium">{d.name}</span>
                      {d.last && (
                        <span
                          className="ml-auto shrink-0"
                          style={{ fontSize: "0.62rem", color: "var(--ink-dim)" }}
                        >
                          {formatTime(d.last.createdAt)}
                        </span>
                      )}
                    </span>
                    <span
                      className="block truncate text-xs"
                      style={{ color: "var(--ink-dim)" }}
                    >
                      {preview(d.last) || (d.online ? "online" : "offline")}
                    </span>
                  </span>
                  {d.unread > 0 && (
                    <span
                      className="silkscreen rounded-full px-2 py-0.5"
                      data-testid="unread-badge"
                      style={{
                        fontSize: "0.6rem",
                        background: "var(--rx)",
                        color: "#0b0d11",
                      }}
                    >
                      {d.unread}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
