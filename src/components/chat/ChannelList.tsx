import { formatTime } from "../../lib/platform/format";

export type AlertLevel = "all" | "mentions" | "mute";

export interface TeamChannelRow {
  key: string;
  name: string;
  postRestricted: boolean;
  unread: number;
  mentionUnread: number;
  alertLevel: AlertLevel;
  last: { name: string; body: string; kind: string; createdAt: number } | null;
}

export interface DmRow {
  key: string;
  otherUserId: string;
  name: string;
  online: boolean;
  unread: number;
  mentionUnread: number;
  alertLevel: AlertLevel;
  last: { name: string; body: string; kind: string; createdAt: number } | null;
}

/** Badge grammar (D23/I8): amber = mentioned ("requires you"), green = unread;
 *  a muted channel goes quiet and dim but a mention still cuts through. */
function RowBadges({
  unread,
  mentionUnread,
  muted,
}: {
  unread: number;
  mentionUnread: number;
  muted: boolean;
}) {
  return (
    <>
      {mentionUnread > 0 && (
        <span
          className="silkscreen rounded-full px-2 py-0.5"
          data-testid="mention-badge"
          style={{ fontSize: "0.6rem", background: "var(--tx)", color: "#141414" }}
        >
          @{mentionUnread}
        </span>
      )}
      {unread > 0 && !muted && (
        <span
          className="silkscreen rounded-full px-2 py-0.5"
          data-testid="unread-badge"
          style={{ fontSize: "0.6rem", background: "var(--rx)", color: "#0b0d11" }}
        >
          {unread}
        </span>
      )}
    </>
  );
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
          {team.map((c) => {
            const muted = c.alertLevel === "mute";
            const mention = c.mentionUnread > 0;
            const lit = c.unread > 0 && !muted;
            return (
              <li key={c.key}>
                <button
                  type="button"
                  data-testid={`chat-channel-${c.key}`}
                  data-muted={muted || undefined}
                  onClick={() => onOpenTeam(c)}
                  className="flex w-full items-center gap-3 rounded-md px-3.5 py-3 text-left"
                  style={{
                    background: "var(--panel)",
                    opacity: muted && !mention ? 0.6 : 1,
                    border: `1px solid ${
                      mention ? "var(--tx)" : lit ? "var(--rx)" : "var(--line)"
                    }`,
                  }}
                >
                  <span
                    className={`led ${
                      mention ? "on-tx rx-blink" : lit ? "on-rx rx-blink" : ""
                    }`}
                  />
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
                      {muted && (
                        <span
                          className="silkscreen"
                          data-testid="muted-tag"
                          style={{ fontSize: "0.5rem", color: "var(--ink-dim)" }}
                        >
                          muted
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
                  <RowBadges
                    unread={c.unread}
                    mentionUnread={c.mentionUnread}
                    muted={muted}
                  />
                </button>
              </li>
            );
          })}
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
            {dms.map((d) => {
              const muted = d.alertLevel === "mute";
              return (
                <li key={d.key}>
                  <button
                    type="button"
                    data-testid={`chat-dm-${d.otherUserId}`}
                    data-muted={muted || undefined}
                    onClick={() => onOpenDm(d)}
                    className="flex w-full items-center gap-3 rounded-md px-3.5 py-3 text-left"
                    style={{
                      background: "var(--panel)",
                      opacity: muted && d.mentionUnread === 0 ? 0.6 : 1,
                      border: `1px solid ${
                        d.mentionUnread > 0
                          ? "var(--tx)"
                          : d.unread > 0 && !muted
                            ? "var(--rx)"
                            : "var(--line)"
                      }`,
                    }}
                  >
                    <span className={`led ${d.online ? "on-rx" : ""}`} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="text-base font-medium">{d.name}</span>
                        {muted && (
                          <span
                            className="silkscreen"
                            data-testid="muted-tag"
                            style={{ fontSize: "0.5rem", color: "var(--ink-dim)" }}
                          >
                            muted
                          </span>
                        )}
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
                    <RowBadges
                      unread={d.unread}
                      mentionUnread={d.mentionUnread}
                      muted={muted}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
