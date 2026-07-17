import { formatTime } from "../../lib/platform/format";
import { ClipMessage } from "./ClipMessage";
import type { Id } from "../../../convex/_generated/dataModel";

export interface ChatMessage {
  _id: string;
  channelKey: string;
  userId: string;
  name: string;
  kind: "text" | "announce" | "system" | "clip";
  body: string;
  clipId?: Id<"transmissions">;
  createdAt: number;
}

interface Props {
  message: ChatMessage;
  mine: boolean;
  accessCode: string;
}

/** One entry in the channel log. A log, not chat bubbles. */
export function MessageRow({ message, mine, accessCode }: Props) {
  if (message.kind === "system") {
    return (
      <div className="flex justify-center py-1">
        <span
          className="silkscreen"
          style={{ fontSize: "0.55rem", color: "var(--ink-dim)" }}
        >
          {message.body}
        </span>
      </div>
    );
  }

  const isAnnounce = message.kind === "announce";

  return (
    <div
      data-testid="chat-message"
      className="rounded-md px-3.5 py-2.5"
      style={{
        background: "var(--panel)",
        border: "1px solid var(--line)",
        borderLeft: isAnnounce
          ? "3px solid var(--tx)"
          : "1px solid var(--line)",
      }}
    >
      <div className="flex items-baseline gap-2">
        <span
          className="silkscreen"
          style={{
            fontSize: "0.58rem",
            color: mine ? "var(--tx)" : "var(--ink-dim)",
          }}
        >
          {mine ? "you" : message.name}
        </span>
        {isAnnounce && (
          <span
            className="silkscreen"
            style={{ fontSize: "0.5rem", color: "var(--tx)" }}
          >
            announcement
          </span>
        )}
        <span
          className="ml-auto text-xs"
          style={{ color: "var(--ink-dim)", fontSize: "0.62rem" }}
        >
          {formatTime(message.createdAt)}
        </span>
      </div>
      {message.kind === "clip" && message.clipId ? (
        <ClipMessage clipId={message.clipId} accessCode={accessCode} />
      ) : (
        <p
          className="mt-1 whitespace-pre-wrap break-words text-[0.95rem] leading-snug"
          style={{ color: "var(--ink)" }}
        >
          {message.body}
        </p>
      )}
    </div>
  );
}
