import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Identity } from "../../hooks/useIdentity";
import { parseBlocks } from "../../lib/blocks/types";
import { formatTime } from "../../lib/platform/format";
import { BlockRenderer } from "./BlockRenderer";
import { DashStrip } from "./DashStrip";
import { Composer } from "../chat/Composer";

interface Props {
  identity: Identity;
  onOpenChannel?: (channelKey: string) => void;
}

/** The single-thread ops assistant (SPEC J6). */
export function OpsTab({ identity, onOpenChannel }: Props) {
  const codeArg = identity.code ? { accessCode: identity.code } : {};
  const me = useQuery(api.users.me, { userId: identity.userId, ...codeArg });
  const thread = useQuery(api.ai.thread, {
    userId: identity.userId,
    ...codeArg,
  });
  const ask = useMutation(api.ai.ask);
  const ensureToday = useMutation(api.tasks.ensureToday);

  const [dashOpen, setDashOpen] = useState(true);
  const dashPrefLoaded = useRef(false);
  useEffect(() => {
    if (me && !dashPrefLoaded.current) {
      dashPrefLoaded.current = true;
      if (me.prefs.dashOpen !== undefined) setDashOpen(me.prefs.dashOpen);
    }
  }, [me]);

  useEffect(() => {
    void ensureToday({ ...codeArg }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A crashed agent run must not lock the composer forever — placeholders
  // older than 3 minutes count as dead (the action's own timeout is shorter).
  const STALE_THINKING_MS = 180_000;
  const working = (thread ?? []).some(
    (m) =>
      m.status === "thinking" && Date.now() - m.createdAt < STALE_THINKING_MS,
  );
  const scrollerRef = useRef<HTMLDivElement>(null);
  const lastId = thread?.length ? thread[thread.length - 1].id : "";
  const lastStatus = thread?.length ? thread[thread.length - 1].status : "";
  const lastText = thread?.length ? thread[thread.length - 1].text : "";
  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId, lastStatus, lastText]);

  return (
    <div className="flex h-full flex-col">
      {/* Header: silkscreen + the LINK lamp (blinks while the agent works) */}
      <header
        className="flex items-center justify-between px-4 pb-2"
        style={{ paddingTop: "max(env(safe-area-inset-top), 1.25rem)" }}
      >
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="silkscreen" style={{ fontSize: "0.6rem", color: "var(--ink-dim)" }}>
              ops · assistant
            </span>
          </div>
          <h1 className="display-type font-bold leading-none" style={{ fontSize: "2rem" }}>
            Ops
          </h1>
        </div>
        <div className="flex flex-col items-center gap-1" data-testid="ops-lamp">
          <span className={`led on-rx ${working ? "rx-blink" : "led-pulse"}`} />
          <span className="silkscreen" style={{ fontSize: "0.5rem", color: "var(--ink-dim)" }}>
            link
          </span>
        </div>
      </header>

      <DashStrip identity={identity} open={dashOpen} onToggle={setDashOpen} />

      {/* The thread */}
      <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {(thread ?? []).length === 0 && (
          <div className="py-10 text-center">
            <p className="silkscreen mb-2" style={{ fontSize: "0.6rem", color: "var(--ink-dim)" }}>
              direct line to your ops data
            </p>
            <p className="text-sm" style={{ color: "var(--ink-dim)" }}>
              Try: "who's on duty?" · "what did I miss on Security?" ·
              "add check west gate to the checklist"
            </p>
          </div>
        )}
        <div className="flex flex-col gap-3">
          {(thread ?? []).map((m) => (
            <div key={m.id} data-testid={`ops-${m.role}`}>
              {m.role === "user" ? (
                <div className="flex justify-end">
                  <div
                    className="max-w-[85%] rounded-md px-3.5 py-2.5"
                    style={{ background: "var(--panel-2)", border: "1px solid var(--line)" }}
                  >
                    <p className="text-[0.95rem]" style={{ color: "var(--ink)" }}>
                      {m.text}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="max-w-[95%]">
                  <div className="mb-1 flex items-baseline gap-2">
                    <span className="silkscreen" style={{ fontSize: "0.52rem", color: "var(--rx)" }}>
                      ops
                    </span>
                    <span style={{ fontSize: "0.6rem", color: "var(--ink-dim)" }}>
                      {formatTime(m.createdAt)}
                    </span>
                  </div>
                  {m.status === "thinking" ? (
                    <div className="flex items-center gap-2.5">
                      <span className="led on-rx rx-blink" style={{ width: 8, height: 8 }} />
                      <span
                        className="silkscreen"
                        data-testid="ops-working"
                        style={{ fontSize: "0.6rem", color: "var(--ink-dim)" }}
                      >
                        {m.text}
                      </span>
                    </div>
                  ) : m.status === "error" ? (
                    <p className="text-sm" style={{ color: "var(--alert)" }}>
                      {m.text}
                    </p>
                  ) : (
                    <BlockRenderer
                      blocks={
                        parseBlocks(m.blocksJson).length
                          ? parseBlocks(m.blocksJson)
                          : [{ type: "text", md: m.text }]
                      }
                      onAction={(action, arg) => {
                        if (action === "open_channel" && arg) onOpenChannel?.(arg);
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <Composer
        placeholder="Ask ops…"
        disabled={working}
        onSend={async (text) => {
          await ask({ userId: identity.userId, text, ...codeArg });
        }}
      />
    </div>
  );
}
