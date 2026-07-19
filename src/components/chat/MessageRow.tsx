import type { ReactNode } from "react";
import { formatTime } from "../../lib/platform/format";
import { getUserId } from "../../lib/platform/identity";
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
  mentions?: { userId: string; name: string }[];
  createdAt: number;
}

interface Props {
  message: ChatMessage;
  mine: boolean;
  accessCode: string;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Highlight resolved @mentions inline (amber = "requires you", D23). */
function renderBody(
  body: string,
  mentions: { userId: string; name: string }[] | undefined,
): ReactNode {
  if (!mentions?.length) return body;
  const names = [...mentions]
    .sort((a, b) => b.name.length - a.name.length)
    .map((m) => escapeRe(m.name));
  const re = new RegExp(`(@(?:${names.join("|")}))`, "gi");
  return body.split(re).map((part, i) =>
    i % 2 === 1 ? (
      <span
        key={i}
        className="rounded px-1"
        style={{
          background: "rgba(255,176,32,0.14)",
          color: "var(--tx)",
          fontWeight: 500,
        }}
      >
        {part}
      </span>
    ) : (
      part
    ),
  );
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
  const mentionsMe =
    !mine && !!message.mentions?.some((m) => m.userId === getUserId());

  return (
    <div
      data-testid="chat-message"
      data-mentions-me={mentionsMe || undefined}
      className="rounded-md px-3.5 py-2.5"
      style={{
        background: mentionsMe ? "rgba(255,176,32,0.05)" : "var(--panel)",
        border: "1px solid var(--line)",
        borderLeft:
          isAnnounce || mentionsMe
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
          {renderBody(message.body, message.mentions)}
        </p>
      )}
    </div>
  );
}
