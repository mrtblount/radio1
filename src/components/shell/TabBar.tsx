export type ShellTab = "radio" | "chat" | "ops";

interface Props {
  tab: ShellTab;
  onTab: (tab: ShellTab) => void;
  showOps: boolean;
  chatUnread: number;
  /** Unread @mentions of me — amber beats green on the chat LED (D23). */
  chatMentions?: number;
  /** On-duty on a radio channel right now. */
  radioActive: boolean;
  onSettings: () => void;
}

/** Bottom mode selector — silkscreen keys with LED indicators + settings. */
export function TabBar({
  tab,
  onTab,
  showOps,
  chatUnread,
  chatMentions = 0,
  radioActive,
  onSettings,
}: Props) {
  const items: Array<{
    key: ShellTab;
    label: string;
    led: "off" | "rx" | "tx";
  }> = [
    { key: "radio", label: "Radio", led: radioActive ? "tx" : "off" },
    {
      key: "chat",
      label: "Chat",
      led: chatMentions > 0 ? "tx" : chatUnread > 0 ? "rx" : "off",
    },
    ...(showOps
      ? [{ key: "ops" as const, label: "Ops", led: "off" as const }]
      : []),
  ];

  return (
    <nav
      className="flex items-stretch"
      style={{
        background: "var(--surface)",
        borderTop: "1.5px solid var(--line)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {items.map((item) => {
        const selected = tab === item.key;
        return (
          <button
            key={item.key}
            type="button"
            data-testid={`tab-${item.key}`}
            onClick={() => onTab(item.key)}
            className="flex flex-1 flex-col items-center justify-center gap-1.5 py-3"
            style={{ minHeight: 56 }}
          >
            <span
              className={`led ${
                item.led === "tx"
                  ? item.key === "chat"
                    ? "on-tx rx-blink"
                    : "on-tx"
                  : item.led === "rx"
                    ? "on-rx rx-blink"
                    : ""
              }`}
              style={{ width: 8, height: 8 }}
            />
            <span
              className="silkscreen rounded-full"
              style={{
                fontSize: "0.62rem",
                padding: "4px 12px",
                color: selected ? "var(--canvas)" : "var(--ink-dim)",
                background: selected ? "var(--ink)" : "transparent",
                transition: "background 120ms ease, color 120ms ease",
              }}
            >
              {item.label}
            </span>
          </button>
        );
      })}
      <button
        type="button"
        data-testid="settings-button"
        onClick={onSettings}
        aria-label="Settings"
        className="flex flex-col items-center justify-center px-4 py-3"
        style={{ minHeight: 56 }}
      >
        <span
          className="silkscreen"
          style={{ fontSize: "0.9rem", color: "var(--ink-dim)" }}
        >
          ⚙
        </span>
      </button>
    </nav>
  );
}
