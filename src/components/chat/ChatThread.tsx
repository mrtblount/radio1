import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Identity } from "../../hooks/useIdentity";
import { formatDayLabel } from "../../lib/platform/format";
import { MessageRow, type ChatMessage } from "./MessageRow";
import { Composer } from "./Composer";

const ADMIN_CODE_KEY = "team-radio:adminCode";

export type AlertLevel = "all" | "mentions" | "mute";

export interface ThreadTarget {
  key: string;
  name: string;
  kind: "team" | "dm";
  postRestricted: boolean;
  online?: boolean;
  otherUserId?: string;
  /** Snapshot at open; the bell keeps its own optimistic state (D23). */
  alertLevel?: AlertLevel;
}

interface Props {
  identity: Identity;
  target: ThreadTarget;
  /** The chat tab is the visible tab (gates read-cursor advancement). */
  visible?: boolean;
  onBack: () => void;
  /** Direct PTT hook-in (Phase D wires this). */
  onGoDirect?: (otherUserId: string, otherName: string) => void;
}

export function ChatThread({
  identity,
  target,
  visible = true,
  onBack,
  onGoDirect,
}: Props) {
  const code = identity.code ? { accessCode: identity.code } : {};
  const { results, status, loadMore } = usePaginatedQuery(
    api.messages.page,
    { channelKey: target.key, userId: identity.userId, ...code },
    { initialNumItems: 40 },
  );
  const send = useMutation(api.messages.send);
  const markRead = useMutation(api.messages.markRead);
  const setTyping = useMutation(api.messages.setTyping);
  const saveAlertLevel = useMutation(api.messages.setAlertLevel);
  const typers = useQuery(api.messages.typers, {
    channelKey: target.key,
    userId: identity.userId,
    ...code,
  });
  const directory = useQuery(api.users.list, code);
  const mentionNames = useMemo(
    () =>
      // Set-dedupe: a reclaimed call sign can appear on two directory rows
      // (30d window vs 7d hold) and duplicate names would collide as keys.
      [
        ...new Set(
          (directory ?? [])
            .filter((u) => u.userId !== identity.userId)
            .map((u) => u.name),
        ),
      ],
    [directory, identity.userId],
  );

  // Per-channel alert level (D23): optimistic local state; the server value
  // (via channels.list) backfills until the user touches the bell.
  const [alertLevel, setAlertLevelState] = useState<AlertLevel>(
    target.alertLevel ?? "all",
  );
  const bellTouchedRef = useRef(false);
  useEffect(() => {
    bellTouchedRef.current = false;
    setAlertLevelState(target.alertLevel ?? "all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.key]);
  useEffect(() => {
    if (!bellTouchedRef.current && target.alertLevel) {
      setAlertLevelState(target.alertLevel);
    }
  }, [target.alertLevel]);
  const cycleAlertLevel = () => {
    bellTouchedRef.current = true;
    const next: AlertLevel =
      alertLevel === "all" ? "mentions" : alertLevel === "mentions" ? "mute" : "all";
    setAlertLevelState(next);
    void saveAlertLevel({
      userId: identity.userId,
      channelKey: target.key,
      level: next,
      ...code,
    }).catch(() => setAlertLevelState(alertLevel));
  };

  const scrollerRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef<number | null>(null);
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

  // Keep the read cursor fresh — but ONLY while the user can actually see the
  // thread: chat tab shown, page visible, scrolled to the bottom. A hidden
  // thread must never silently swallow unread state.
  const [visTick, setVisTick] = useState(0);
  useEffect(() => {
    const onVis = () => setVisTick((t) => t + 1);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  useEffect(() => {
    if (!visible || !pinnedToBottom) return;
    if (document.visibilityState !== "visible") return;
    void markRead({
      userId: identity.userId,
      channelKey: target.key,
      ...code,
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestAt, pinnedToBottom, target.key, visible, visTick]);

  // Autoscroll on new messages while pinned.
  useEffect(() => {
    if (pinnedToBottom && scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [latestAt, pinnedToBottom]);

  // Load-earlier scroll compensation: keep the previously-visible message in
  // place after older messages prepend above it.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    const prev = prevScrollHeightRef.current;
    if (el && prev !== null && el.scrollHeight > prev) {
      el.scrollTop += el.scrollHeight - prev;
      prevScrollHeightRef.current = null;
    }
  }, [messages.length]);

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

  // Typing expiry is time-based, not data-based — tick while any beacon is
  // live so "X typing…" actually clears at the 4s TTL.
  const [, setTypingTick] = useState(0);
  const hasTypers = (typers ?? []).length > 0;
  useEffect(() => {
    if (!hasTypers) return;
    const interval = window.setInterval(() => setTypingTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [hasTypers]);
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
        <button
          type="button"
          data-testid="alert-level-toggle"
          onClick={cycleAlertLevel}
          className="silkscreen ml-auto shrink-0 rounded px-2.5 py-2"
          style={{
            fontSize: "0.55rem",
            color:
              alertLevel === "mentions"
                ? "var(--tx)"
                : alertLevel === "mute"
                  ? "var(--ink-dim)"
                  : "var(--ink)",
            background: alertLevel === "mute" ? "var(--panel-2)" : "transparent",
            border: `1px solid ${
              alertLevel === "mentions" ? "var(--tx)" : "var(--line)"
            }`,
          }}
        >
          {alertLevel === "all"
            ? "alerts: all"
            : alertLevel === "mentions"
              ? "alerts: @"
              : "muted"}
        </button>
        {target.kind === "dm" && onGoDirect && target.otherUserId && (
          <button
            type="button"
            data-testid="go-direct"
            onClick={() => onGoDirect(target.otherUserId!, target.name)}
            className="silkscreen shrink-0 rounded px-3 py-2"
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
            onClick={() => {
              // Prepending shifts content down — compensate so the reader
              // keeps their place (iOS Safari has no scroll anchoring here).
              const el = scrollerRef.current;
              prevScrollHeightRef.current = el ? el.scrollHeight : null;
              loadMore(40);
            }}
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
          mentionNames={target.kind === "team" ? mentionNames : undefined}
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
