import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { ClipMessage } from "../chat/ClipMessage";
import { formatClock } from "../../lib/platform/format";
import { getUserId } from "../../lib/platform/identity";

interface Props {
  open: boolean;
  channel: string;
  accessCode: string;
  onClose: () => void;
}

/** The channel's transmission history — playback + transcripts (SPEC J3). */
export function TransmissionLog({ open, channel, accessCode, onClose }: Props) {
  const clips = useQuery(
    api.transmissions.forChannel,
    open
      ? {
          channelKey: channel,
          userId: getUserId(),
          ...(accessCode ? { accessCode } : {}),
        }
      : "skip",
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center"
      style={{ background: "rgba(27,26,30,0.45)" }}
      onClick={onClose}
    >
      <div
        className="flex max-h-[80%] w-full max-w-md flex-col rounded-t-xl px-4 pt-4"
        style={{
          background: "var(--chassis)",
          border: "1px solid var(--line)",
          paddingBottom: "max(env(safe-area-inset-bottom), 1.5rem)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="mx-auto mb-3 h-1 w-10 rounded-full"
          style={{ background: "var(--line)" }}
        />
        <div className="mb-3 flex items-baseline justify-between">
          <span
            className="silkscreen"
            style={{ fontSize: "0.65rem", color: "var(--ink-dim)" }}
          >
            transmission log · {channel}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="silkscreen rounded px-2 py-1"
            style={{
              fontSize: "0.6rem",
              color: "var(--ink-dim)",
              border: "1px solid var(--line)",
            }}
          >
            close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pb-2" data-testid="transmission-log">
          {clips === undefined && (
            <p className="silkscreen py-6 text-center" style={{ fontSize: "0.6rem", color: "var(--ink-dim)" }}>
              reading log…
            </p>
          )}
          {clips !== undefined && clips.length === 0 && (
            <p className="silkscreen py-6 text-center" style={{ fontSize: "0.6rem", color: "var(--ink-dim)" }}>
              no transmissions logged yet
            </p>
          )}
          <ul className="flex flex-col gap-1.5">
            {(clips ?? []).map((c) => (
              <li
                key={c.id}
                className="rounded-md px-3.5 py-2.5"
                style={{ background: "var(--panel)", border: "1px solid var(--line)" }}
              >
                <div className="flex items-baseline gap-2">
                  <span
                    className="silkscreen"
                    style={{ fontSize: "0.58rem", color: "var(--ink-dim)" }}
                  >
                    {c.name}
                  </span>
                  <span
                    className="ml-auto"
                    style={{ fontSize: "0.62rem", color: "var(--ink-dim)" }}
                  >
                    {formatClock(c.startedAt)}
                  </span>
                </div>
                <ClipMessage clipId={c.id} accessCode={accessCode} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
