import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Identity } from "../../hooks/useIdentity";

interface Props {
  identity: Identity;
  open: boolean;
  onToggle: (open: boolean) => void;
}

/** The three-card ops readout ("Daily Overview" band, our tokens). */
export function DashStrip({ identity, open, onToggle }: Props) {
  const codeArg = identity.code ? { accessCode: identity.code } : {};
  const dash = useQuery(api.ai.dashboard, {
    userId: identity.userId,
    ...codeArg,
  });
  const setPrefs = useMutation(api.users.setPrefs);

  const toggle = () => {
    onToggle(!open);
    void setPrefs({
      userId: identity.userId,
      prefs: { dashOpen: !open },
    }).catch(() => {});
  };

  const cards = [
    {
      label: "on duty",
      value: dash ? String(dash.onDuty) : "–",
      sub: "on the radio now",
      live: (dash?.onDuty ?? 0) > 0,
    },
    {
      label: "missed",
      value: dash ? String(dash.missed) : "–",
      sub: "transmissions to review",
      live: false,
    },
    {
      label: "checklist",
      value: dash ? `${dash.tasksDone}/${dash.tasksTotal}` : "–",
      sub: "done today",
      live: false,
    },
  ];

  return (
    <div className="px-4 pt-2" data-testid="dash-strip">
      <button
        type="button"
        data-testid="dash-toggle"
        onClick={toggle}
        className="flex w-full items-center gap-2 py-1.5"
      >
        <span className="silkscreen" style={{ fontSize: "0.55rem", color: "var(--ink-dim)" }}>
          today's board
        </span>
        <span className="h-px flex-1" style={{ background: "var(--line)" }} />
        <span className="silkscreen" style={{ fontSize: "0.6rem", color: "var(--ink-dim)" }}>
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open && (
        <div className="flex gap-2 pb-1" data-testid="dash-cards">
          {cards.map((c) => (
            <div
              key={c.label}
              className="flex-1 rounded-md px-3 py-2.5"
              style={{ background: "var(--panel)", border: "1px solid var(--line)" }}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={`led ${c.live ? "on-rx" : ""}`}
                  style={{ width: 6, height: 6 }}
                />
                <span
                  className="silkscreen"
                  style={{ fontSize: "0.5rem", color: "var(--ink-dim)" }}
                >
                  {c.label}
                </span>
              </div>
              <div
                className="display-type mt-1 font-bold"
                style={{ fontSize: "1.4rem", lineHeight: 1 }}
              >
                {c.value}
              </div>
              <div className="mt-0.5" style={{ fontSize: "0.6rem", color: "var(--ink-dim)" }}>
                {c.sub}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
