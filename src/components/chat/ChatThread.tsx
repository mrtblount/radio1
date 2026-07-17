import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Identity } from "../../hooks/useIdentity";
import { formatDayLabel } from "../../lib/platform/format";
import { MessageRow, type ChatMessage } from "./MessageRow";
import { Composer } from "./Composer";

const ADMIN_CODE_KEY = "team-radio:adminCode";

export interface ThreadTarget {
  key: string;
  name: string;
  kind: "team" | "dm";
  postRestricted: boolean;
  online?: boolean;
  otherUserId?: string;
}

interface Props {
  identity: Identity;
  target: ThreadTarget;
  onBack: () => void;
  /** Direct PTT hook-in (Phase D wires this). */
  onGoDirect?: (otherUserId: string, otherName: string) => void;
}

export function ChatThread({ identity, target, onBack, onGoDirect }: Props) {
  const code = identity.code ? { accessCode: identity.code } : {};
  const { results, status, loadMore } = usePaginatedQuery(
    api.messages.page,
    { channelKey: target.key, ...code },
    { initialNumItems: 40 },
  );
  const send = useMutation(api.messages.send);
  const markRead = useMutation(api.messages.markRead);
  const setTyping = useMutation(api.messages.setTyping);
  const typers = useQuery(api.messages.typers, {
    channelKey: target.key,
    userId: identity.userId,
    ...code,
  });

  const scrollerRef = useRef<HTMLDivElement>(null);
  const [pinnedToBottom, setPinnedToBottom] = useState(true);
  const [adminCode, setAdminCode] = useState(
    () => sessionStorage.getItem(ADMIN_CODE_KEY) ?? "",
  );
  const [adminEntry, setAdminEntry] = useState("");
  const verify = useQuery(
    api.settings.verifyAdmin,
    target.postRestricted && adminEntry ? { adminCode: adminEntry } : "skip",
  );

  // Oldest → newest for display.
  const messages = useMemo(
    () => [...(results as ChatMessage[])].reverse(),
    [results],
  );

  const latestAt = messages.length
    ? messages[messages.length - 1].createdAt
    : 0;

  // Keep the read cursor fresh while the thread is open at the bottom.
  useEffect(() => {
    if (!pinnedToBottom) return;
    void markRead({
      userId: identity.userId,
      channelKey: target.key,
      ...code,
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestAt, pinnedToBottom, target.key]);

  // Autoscroll on new messages while pinned.
  useEffect(() => {
    if (pinnedToBottom && scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [latestAt, pinnedToBottom]);

  // Initial scroll to bottom.
  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [target.key]);

  const onScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setPinnedToBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 60);
  }, []);

  // Admin unlock (Announcements composer).
  useEffect(() => {
    if (verify?.ok && adminEntry) {
      sessionStorage.setItem(ADMIN_CODE_KEY, adminEntry);
      setAdminCode(adminEntry);
    }
  }, [verify, adminEntry]);

  const canPost = !target.postRestricted || !!adminCode;
  const activeTypers = (typers ?? []).filter((t) => t.until > Date.now());

  let lastDay = "";

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header
        className="flex items-center gap-3 px-4 py-3"
        style={{ background: "var(--panel)", borderBottom: "1px solid var(--line)" }}
      >
        <button
          type="button"
          data-testid="chat-back"
          onClick={onBack}
          className="silkscreen rounded px-2 py-1.5"
          style={{
            fontSize: "0.7rem",
            color: "var(--ink-dim)",
            border: "1px solid var(--line)",
          }}
        >
          ‹
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {target.kind === "dm" && (
              <span className={`led ${target.online ? "on-rx" : ""}`} />
            )}
            <span
              className="display-type truncate font-bold"
              style={{ fontSize: "1.15rem" }}
            >
              {target.name}
            </span>
          </div>
          <div
            className="silkscreen"
            style={{ fontSize: "0.5rem", color: "var(--ink-dim)" }}
          >
            {target.kind === "dm"
              ? target.online
                ? "online"
                : "offline"
              : target.postRestricted
                ? "team leads post · everyone reads"
                : "team channel"}
          </div>
        </div>
        {target.kind === "dm" && onGoDirect && target.otherUserId && (
          <button
            type="button"
            data-testid="go-direct"
            onClick={() => onGoDirect(target.otherUserId!, target.name)}
            className="silkscreen ml-auto rounded px-3 py-2"
            style={{
              fontSize: "0.62rem",
              color: target.online ? "#141414" : "var(--ink-dim)",
              background: target.online ? "var(--rx)" : "var(--panel-2)",
              border: "1px solid var(--line)",
            }}
          >
            go direct
          </button>
        )}
      </header>

      {/* Log */}
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-3"
      >
        {status === "CanLoadMore" && (
          <button
            type="button"
            onClick={() => loadMore(40)}
            className="silkscreen mb-3 w-full rounded-md py-2"
            style={{
              fontSize: "0.6rem",
              color: "var(--ink-dim)",
              border: "1px solid var(--line)",
            }}
          >
            load earlier
          </button>
        )}
        <div className="flex flex-col gap-1.5">
          {messages.map((m) => {
            const day = formatDayLabel(m.createdAt);
            const divider = day !== lastDay;
            lastDay = day;
            return (
              <div key={m._id}>
                {divider && (
                  <div className="flex items-center gap-3 py-2">
                    <span
                      className="h-px flex-1"
                      style={{ background: "var(--line)" }}
                    />
                    <span
                      className="silkscreen"
                      style={{ fontSize: "0.55rem", color: "var(--ink-dim)" }}
                    >
                      {day}
                    </span>
                    <span
                      className="h-px flex-1"
                      style={{ background: "var(--line)" }}
                    />
                  </div>
                )}
                <MessageRow
                  message={m}
                  mine={m.userId === identity.userId}
                  accessCode={identity.code}
                />
              </div>
            );
          })}
          {messages.length === 0 && status !== "LoadingFirstPage" && (
            <div className="py-10 text-center">
              <span
                className="silkscreen"
                style={{ fontSize: "0.6rem", color: "var(--ink-dim)" }}
              >
                channel clear — nothing logged yet
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Typing */}
      {activeTypers.length > 0 && (
        <div className="px-4 pb-1">
          <span
            className="silkscreen"
            style={{ fontSize: "0.55rem", color: "var(--rx)" }}
          >
            {activeTypers.map((t) => t.name).join(", ")} typing…
          </span>
        </div>
      )}

      {/* Composer / lock */}
      {canPost ? (
        <Composer
          placeholder={
            target.kind === "dm" ? `Message ${target.name}` : `Message ${target.name}`
          }
          onSend={async (body) => {
            await send({
              channelKey: target.key,
              userId: identity.userId,
              body,
              ...code,
              ...(adminCode ? { adminCode } : {}),
            });
            setPinnedToBottom(true);
          }}
          onTyping={() =>
            void setTyping({
              channelKey: target.key,
              userId: identity.userId,
              ...code,
            }).catch(() => {})
          }
        />
      ) : (
        <div
          className="flex items-center gap-2 px-4 py-3"
          style={{ background: "var(--panel)", borderTop: "1px solid var(--line)" }}
        >
          <span
            className="silkscreen"
            style={{ fontSize: "0.6rem", color: "var(--ink-dim)" }}
          >
            team leads only —
          </span>
          <input
            value={adminEntry}
            onChange={(e) => setAdminEntry(e.target.value)}
            placeholder="admin code"
            className="w-28 rounded px-2 py-1.5 text-sm outline-none"
            style={{
              background: "var(--panel-2)",
              border: "1px solid var(--line)",
              color: "var(--ink)",
            }}
          />
          {adminEntry && verify && !verify.ok && (
            <span
              className="silkscreen"
              style={{ fontSize: "0.55rem", color: "var(--alert)" }}
            >
              no
            </span>
          )}
        </div>
      )}
    </div>
  );
}
