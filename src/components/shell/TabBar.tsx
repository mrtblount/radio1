export type ShellTab = "radio" | "chat" | "ops";

interface Props {
  tab: ShellTab;
  onTab: (tab: ShellTab) => void;
  showOps: boolean;
  chatUnread: number;
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
  radioActive,
  onSettings,
}: Props) {
  const items: Array<{
    key: ShellTab;
    label: string;
    led: "off" | "rx" | "tx";
  }> = [
    { key: "radio", label: "Radio", led: radioActive ? "tx" : "off" },
    { key: "chat", label: "Chat", led: chatUnread > 0 ? "rx" : "off" },
    ...(showOps
      ? [{ key: "ops" as const, label: "Ops", led: "off" as const }]
      : []),
  ];

  return (
    <nav
      className="flex items-stretch"
      style={{
        background: "var(--panel)",
        borderTop: "1px solid var(--line)",
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
                  ? "on-tx"
                  : item.led === "rx"
                    ? "on-rx rx-blink"
                    : ""
              }`}
              style={{ width: 8, height: 8 }}
            />
            <span
              className="silkscreen"
              style={{
                fontSize: "0.62rem",
                color: selected ? "var(--ink)" : "var(--ink-dim)",
                borderBottom: selected
                  ? "2px solid var(--tx)"
                  : "2px solid transparent",
                paddingBottom: 2,
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
