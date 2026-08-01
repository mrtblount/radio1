import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Identity } from "../../hooks/useIdentity";

interface Props {
  open: boolean;
  channelKey: string;
  channelName: string;
  identity: Identity;
  onClose: () => void;
}

/** Buzz-style channel agents: list the team's agents, toggle them in and out
 *  of THIS channel, and mint new ones — name, brief, listening mode. */
export function AgentSheet({
  open,
  channelKey,
  channelName,
  identity,
  onClose,
}: Props) {
  const code = identity.code ? { accessCode: identity.code } : {};
  const agents = useQuery(api.agents.list, open ? code : "skip");
  const createAgent = useMutation(api.agents.create);
  const setMembership = useMutation(api.agents.setMembership);

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [brief, setBrief] = useState("");
  const [listenAll, setListenAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center md:items-center"
      style={{ background: "rgba(27,26,30,0.45)" }}
      onClick={onClose}
    >
      <div
        className="flex max-h-[85dvh] w-full max-w-md flex-col rounded-t-3xl px-5 pt-4 md:rounded-3xl"
        style={{
          background: "var(--surface)",
          border: "1.5px solid var(--line)",
          paddingBottom: "max(env(safe-area-inset-bottom), 1.5rem)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="mx-auto mb-4 h-1 w-10 shrink-0 rounded-full md:hidden"
          style={{ background: "var(--line-strong)" }}
        />
        <div className="mb-1 flex items-baseline gap-2">
          <span className="display-num" style={{ fontSize: "1.6rem" }}>
            AGENTS
          </span>
          <span className="silkscreen" style={{ fontSize: "0.6rem", color: "var(--ink-dim)" }}>
            in {channelName}
          </span>
        </div>
        <p className="mb-4 text-[0.82rem]" style={{ color: "var(--ink-dim)" }}>
          Agents hear what the channel hears — voice and text — and answer
          right in the thread. Say their name to reach one.
        </p>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {(agents ?? []).length === 0 && !creating && (
            <p className="py-4 text-sm" style={{ color: "var(--ink-dim)" }}>
              No agents on this team yet.
            </p>
          )}
          <ul className="flex flex-col gap-2">
            {(agents ?? []).map((a) => {
              const member = a.channelKeys.includes(channelKey);
              return (
                <li
                  key={a.agentId}
                  data-testid={`agent-row-${a.name}`}
                  className="flex items-center gap-3 rounded-2xl px-3.5 py-3"
                  style={{
                    background: member
                      ? "color-mix(in srgb, var(--lavender) 12%, var(--surface))"
                      : "var(--surface)",
                    border: `1.5px solid ${member ? "var(--lavender)" : "var(--line)"}`,
                  }}
                >
                  <span
                    className="slab slab-lavender display-num flex h-10 w-10 shrink-0 items-center justify-center"
                    style={{ fontSize: "1rem", borderRadius: 12 }}
                  >
                    {a.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.95rem] font-semibold">{a.name}</span>
                    <span className="silkscreen block" style={{ fontSize: "0.5rem", color: "var(--ink-dim)" }}>
                      {a.listenMode === "all" ? "always listening" : "answers to name"}
                    </span>
                  </span>
                  <button
                    type="button"
                    data-testid={`agent-toggle-${a.name}`}
                    onClick={() => {
                      void setMembership({
                        agentId: a.agentId,
                        channelKey,
                        member: !member,
                        ...code,
                      }).catch(() => {});
                    }}
                    className={`pill silkscreen ${member ? "" : "on"}`}
                    style={{ fontSize: "0.55rem", padding: "7px 14px" }}
                  >
                    {member ? "remove" : "add"}
                  </button>
                </li>
              );
            })}
          </ul>

          {creating && (
            <div
              className="mt-3 rounded-2xl p-4"
              style={{ background: "var(--surface-2)" }}
            >
              <input
                data-testid="agent-name"
                value={name}
                autoFocus
                maxLength={24}
                placeholder="Agent name — e.g. Dispatch"
                onChange={(e) => setName(e.target.value)}
                className="mb-2.5 w-full rounded-xl px-3.5 py-2.5 text-base outline-none"
                style={{ background: "var(--surface)", border: "1.5px solid var(--line)", color: "var(--ink)" }}
              />
              <textarea
                data-testid="agent-brief"
                value={brief}
                rows={3}
                maxLength={2000}
                placeholder="Brief — what should this agent know and do for the team?"
                onChange={(e) => setBrief(e.target.value)}
                className="mb-2.5 w-full resize-none rounded-xl px-3.5 py-2.5 text-sm outline-none"
                style={{ background: "var(--surface)", border: "1.5px solid var(--line)", color: "var(--ink)" }}
              />
              <div className="mb-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setListenAll(false)}
                  className={`pill silkscreen ${listenAll ? "" : "on"}`}
                  style={{ fontSize: "0.55rem", padding: "7px 12px" }}
                >
                  answers to name
                </button>
                <button
                  type="button"
                  data-testid="agent-listen-all"
                  onClick={() => setListenAll(true)}
                  className={`pill silkscreen ${listenAll ? "on" : ""}`}
                  style={{ fontSize: "0.55rem", padding: "7px 12px" }}
                >
                  always listening
                </button>
              </div>
              {error && (
                <p className="mb-2 text-sm" style={{ color: "var(--alert)" }}>
                  {error}
                </p>
              )}
              <button
                type="button"
                data-testid="agent-create"
                disabled={name.trim().length < 2 || busy}
                onClick={() => {
                  setBusy(true);
                  setError(null);
                  void createAgent({
                    name: name.trim(),
                    instructions: brief.trim(),
                    listenMode: listenAll ? "all" : "mention",
                    channelKey,
                    userId: identity.userId,
                    ...code,
                  })
                    .then(() => {
                      setName("");
                      setBrief("");
                      setCreating(false);
                    })
                    .catch((e: unknown) =>
                      setError(e instanceof Error ? e.message : "Couldn't create agent"),
                    )
                    .finally(() => setBusy(false));
                }}
                className="display-type w-full rounded-full py-3"
                style={{
                  fontSize: "0.95rem",
                  letterSpacing: "0.05em",
                  border: "none",
                  cursor: "pointer",
                  background: name.trim().length >= 2 && !busy ? "var(--ink)" : "var(--surface)",
                  color: name.trim().length >= 2 && !busy ? "var(--canvas)" : "var(--ink-faint)",
                }}
              >
                {busy ? "MINTING…" : "ADD TO CHANNEL"}
              </button>
            </div>
          )}
        </div>

        {!creating && (
          <button
            type="button"
            data-testid="agent-new"
            onClick={() => setCreating(true)}
            className="pill on mt-4 w-full shrink-0"
            style={{ padding: "12px 0", fontSize: "0.9rem" }}
          >
            + new agent
          </button>
        )}
      </div>
    </div>
  );
}
