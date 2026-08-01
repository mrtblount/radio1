import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Identity } from "../../hooks/useIdentity";

export interface TeamMember {
  userId: string;
  name: string;
  online: boolean;
  onRadioChannel: string | null;
}

interface Props {
  open: boolean;
  identity: Identity;
  title?: string;
  onClose: () => void;
  onMessage: (member: TeamMember) => void;
  /** Present once direct PTT ships (Phase D). */
  onGoDirect?: (member: TeamMember) => void;
}

/** The team directory: who's around, message them, or go direct. */
export function MemberSheet({
  open,
  identity,
  title,
  onClose,
  onMessage,
  onGoDirect,
}: Props) {
  const members = useQuery(
    api.users.list,
    open ? { ...(identity.code ? { accessCode: identity.code } : {}) } : "skip",
  );

  if (!open) return null;
  const others = (members ?? []).filter((m) => m.userId !== identity.userId);

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center"
      style={{ background: "rgba(27,26,30,0.45)" }}
      onClick={onClose}
    >
      <div
        className="flex max-h-[75%] w-full max-w-md flex-col rounded-t-3xl px-5 pt-4"
        style={{
          background: "var(--panel)",
          border: "1.5px solid var(--line)",
          paddingBottom: "max(env(safe-area-inset-bottom), 2rem)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="mx-auto mb-4 h-1 w-10 rounded-full"
          style={{ background: "var(--line)" }}
        />
        <div
          className="silkscreen mb-3"
          style={{ fontSize: "0.65rem", color: "var(--ink-dim)" }}
        >
          {title ?? "team"} · {others.length}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {others.length === 0 && (
            <p className="py-6 text-sm" style={{ color: "var(--ink-dim)" }}>
              Nobody else has joined yet.
            </p>
          )}
          <ul className="flex flex-col gap-1.5 pb-2">
            {others.map((m) => (
              <li
                key={m.userId}
                data-testid={`member-${m.name}`}
                className="flex items-center gap-3 rounded-2xl px-3.5 py-3"
                style={{ background: "var(--panel-2)", border: "1.5px solid var(--line)" }}
              >
                <span className={`led ${m.online ? "on-rx" : ""}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-medium">
                    {m.name}
                  </span>
                  <span
                    className="silkscreen block"
                    style={{ fontSize: "0.5rem", color: "var(--ink-dim)" }}
                  >
                    {m.onRadioChannel
                      ? `on air · ${m.onRadioChannel}`
                      : m.online
                        ? "online"
                        : "offline"}
                  </span>
                </span>
                <button
                  type="button"
                  data-testid={`member-message-${m.name}`}
                  onClick={() => onMessage(m)}
                  className="silkscreen rounded px-3 py-2"
                  style={{
                    fontSize: "0.6rem",
                    color: "var(--ink-dim)",
                    border: "1.5px solid var(--line)",
                  }}
                >
                  message
                </button>
                {onGoDirect && (
                  <button
                    type="button"
                    data-testid={`member-direct-${m.name}`}
                    onClick={() => onGoDirect(m)}
                    disabled={!m.online && !m.onRadioChannel}
                    className="silkscreen rounded px-3 py-2"
                    style={{
                      fontSize: "0.6rem",
                      color:
                        m.online || m.onRadioChannel ? "#f7f5f0" : "var(--ink-dim)",
                      background:
                        m.online || m.onRadioChannel
                          ? "var(--rx)"
                          : "var(--panel-2)",
                      border: "1.5px solid var(--line)",
                    }}
                  >
                    direct
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
