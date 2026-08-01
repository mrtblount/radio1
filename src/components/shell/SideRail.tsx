import type { ShellTab } from "./TabBar";

interface Props {
  tab: ShellTab;
  onTab: (tab: ShellTab) => void;
  showOps: boolean;
  chatUnread: number;
  chatMentions?: number;
  radioActive: boolean;
  onSettings: () => void;
}

/** Desktop-only left rail — the wordmark, the three modes, settings. */
export function SideRail({
  tab,
  onTab,
  showOps,
  chatUnread,
  chatMentions = 0,
  radioActive,
  onSettings,
}: Props) {
  const items: Array<{ key: ShellTab; label: string }> = [
    { key: "radio", label: "Radio" },
    { key: "chat", label: "Chat" },
    ...(showOps ? [{ key: "ops" as const, label: "Ops" }] : []),
  ];

  return (
    <nav
      className="hidden h-full w-[86px] shrink-0 flex-col items-center md:flex"
      style={{
        background: "var(--surface)",
        borderRight: "1.5px solid var(--line)",
        paddingTop: "max(env(safe-area-inset-top), 1.25rem)",
        paddingBottom: "1rem",
      }}
    >
      <div className="display-num select-none" style={{ fontSize: "1.7rem" }}>
        R
      </div>
      <div
        className="mt-1 h-[4px] w-7 rounded-full"
        style={{ background: "var(--coral)" }}
      />

      <div className="mt-8 flex flex-col items-center gap-2.5">
        {items.map((item) => {
          const selected = tab === item.key;
          const dot =
            item.key === "radio"
              ? radioActive
                ? "on-tx"
                : ""
              : item.key === "chat"
                ? chatMentions > 0
                  ? "on-tx rx-blink"
                  : chatUnread > 0
                    ? "on-rx rx-blink"
                    : ""
                : "";
          return (
            <button
              key={item.key}
              type="button"
              data-testid={`rail-${item.key}`}
              onClick={() => onTab(item.key)}
              className="relative flex w-[68px] flex-col items-center gap-1 rounded-2xl py-2.5"
              style={{
                background: selected ? "var(--ink)" : "transparent",
                color: selected ? "var(--canvas)" : "var(--ink-dim)",
                border: "none",
                cursor: "pointer",
                transition: "background 120ms ease, color 120ms ease",
              }}
            >
              <span
                className={`led ${dot}`}
                style={{ width: 7, height: 7, opacity: dot ? 1 : 0.35 }}
              />
              <span className="silkscreen" style={{ fontSize: "0.58rem" }}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        data-testid="rail-settings"
        onClick={onSettings}
        aria-label="Settings"
        className="orb mt-auto"
        style={{ fontSize: "0.95rem" }}
      >
        ⚙
      </button>
    </nav>
  );
}
