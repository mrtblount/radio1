import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Identity } from "../../hooks/useIdentity";
import { loadKeepAwake, saveKeepAwake } from "../../lib/radio/session";
import {
  disablePush,
  enablePush,
  needsInstallFirst,
  pushSupported,
  type PushSetupResult,
} from "../../lib/platform/notifications";

const ADMIN_CODE_KEY = "team-radio:adminCode";

interface Props {
  open: boolean;
  identity: Identity;
  onClose: () => void;
  /** Live-apply the keep-awake pref to the radio's wake lock (D18). */
  onKeepAwakeChange?: (on: boolean) => void;
}

export function SettingsSheet({
  open,
  identity,
  onClose,
  onKeepAwakeChange,
}: Props) {
  const codeArg = identity.code ? { accessCode: identity.code } : {};
  const me = useQuery(
    api.users.me,
    open ? { userId: identity.userId, ...codeArg } : "skip",
  );
  const config = useQuery(api.settings.teamConfig);
  const setFlags = useMutation(api.settings.setFlags);

  const [busy, setBusy] = useState(false);
  const [pushState, setPushState] = useState<PushSetupResult | null>(null);
  const [keepAwake, setKeepAwake] = useState(loadKeepAwake);
  const [adminEntry, setAdminEntry] = useState("");
  const [adminCode, setAdminCode] = useState(
    () => sessionStorage.getItem(ADMIN_CODE_KEY) ?? "",
  );
  const verify = useQuery(
    api.settings.verifyAdmin,
    adminEntry ? { adminCode: adminEntry } : "skip",
  );
  useEffect(() => {
    if (verify?.ok && adminEntry) {
      sessionStorage.setItem(ADMIN_CODE_KEY, adminEntry);
      setAdminCode(adminEntry);
      setAdminEntry("");
    }
  }, [verify, adminEntry]);

  if (!open) return null;

  const notifyOn = me?.prefs.notifyEnabled ?? false;

  const toggleAlerts = async () => {
    setBusy(true);
    try {
      if (notifyOn) {
        await disablePush();
        setPushState(null);
      } else {
        setPushState(await enablePush());
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        className="flex max-h-[85%] w-full max-w-md flex-col overflow-y-auto rounded-t-xl px-5 pt-4"
        style={{
          background: "var(--chassis)",
          border: "1px solid var(--line)",
          paddingBottom: "max(env(safe-area-inset-bottom), 2rem)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="mx-auto mb-4 h-1 w-10 rounded-full"
          style={{ background: "var(--line)" }}
        />
        <div className="mb-4 flex items-center justify-between">
          <span className="silkscreen" style={{ fontSize: "0.65rem", color: "var(--ink-dim)" }}>
            settings
          </span>
          <button
            type="button"
            onClick={onClose}
            className="silkscreen rounded px-2 py-1"
            style={{ fontSize: "0.6rem", color: "var(--ink-dim)", border: "1px solid var(--line)" }}
          >
            close
          </button>
        </div>

        {/* Identity */}
        <div
          className="mb-3 rounded-md px-4 py-3"
          style={{ background: "var(--panel)", border: "1px solid var(--line)" }}
        >
          <div className="silkscreen mb-1" style={{ fontSize: "0.55rem", color: "var(--ink-dim)" }}>
            call sign
          </div>
          <div className="text-base font-medium">{identity.name}</div>
        </div>

        {/* Alerts */}
        <div
          className="mb-3 rounded-md px-4 py-3"
          style={{ background: "var(--panel)", border: "1px solid var(--line)" }}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="silkscreen mb-1" style={{ fontSize: "0.55rem", color: "var(--ink-dim)" }}>
                alerts
              </div>
              <div className="text-sm" style={{ color: "var(--ink)" }}>
                Messages, announcements & missed transmissions
              </div>
            </div>
            <button
              type="button"
              data-testid="alerts-toggle"
              disabled={busy}
              onClick={() => void toggleAlerts()}
              className="silkscreen rounded px-3 py-2"
              style={{
                fontSize: "0.62rem",
                background: notifyOn ? "var(--rx)" : "var(--panel-2)",
                color: notifyOn ? "#0b0d11" : "var(--ink-dim)",
                border: "1px solid var(--line)",
              }}
            >
              {busy ? "…" : notifyOn ? "on" : "off"}
            </button>
          </div>
          {pushState === "needs-install" && (
            <p className="mt-2 text-xs" style={{ color: "var(--tx)" }}>
              iPhone needs the app installed first: tap Share, then "Add to
              Home Screen", open it from there and flip this on.
            </p>
          )}
          {pushState === "denied" && (
            <p className="mt-2 text-xs" style={{ color: "var(--alert)" }}>
              Notifications are blocked for this site — enable them in your
              browser settings, then try again.
            </p>
          )}
          {pushState === "unsupported" && (
            <p className="mt-2 text-xs" style={{ color: "var(--ink-dim)" }}>
              This browser doesn't support push alerts.
            </p>
          )}
          {pushState === "error" && (
            <p className="mt-2 text-xs" style={{ color: "var(--alert)" }}>
              Couldn't set up alerts — check your connection and try again.
            </p>
          )}
          {!pushSupported() && needsInstallFirst() && pushState === null && (
            <p className="mt-2 text-xs" style={{ color: "var(--ink-dim)" }}>
              Install to Home Screen to receive alerts with the screen off.
            </p>
          )}
        </div>

        {/* Screen (D18) */}
        <div
          className="mb-3 rounded-md px-4 py-3"
          style={{ background: "var(--panel)", border: "1px solid var(--line)" }}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="silkscreen mb-1" style={{ fontSize: "0.55rem", color: "var(--ink-dim)" }}>
                screen
              </div>
              <div className="text-sm" style={{ color: "var(--ink)" }}>
                Keep screen awake while on duty
              </div>
            </div>
            <button
              type="button"
              data-testid="keep-awake-toggle"
              onClick={() => {
                const next = !keepAwake;
                setKeepAwake(next);
                saveKeepAwake(next);
                onKeepAwakeChange?.(next);
              }}
              className="silkscreen rounded px-3 py-2"
              style={{
                fontSize: "0.62rem",
                background: keepAwake ? "var(--rx)" : "var(--panel-2)",
                color: keepAwake ? "#0b0d11" : "var(--ink-dim)",
                border: "1px solid var(--line)",
              }}
            >
              {keepAwake ? "on" : "off"}
            </button>
          </div>
          <p className="mt-2 text-xs" style={{ color: "var(--ink-dim)" }}>
            With the screen off, live radio audio stops — that's a web
            platform limit. Missed transmissions still arrive as clips and
            alerts.
          </p>
        </div>

        {/* Team setup (admin) */}
        <div
          className="mb-3 rounded-md px-4 py-3"
          style={{ background: "var(--panel)", border: "1px solid var(--line)" }}
        >
          <div className="silkscreen mb-2" style={{ fontSize: "0.55rem", color: "var(--ink-dim)" }}>
            team setup
          </div>
          {!config?.adminConfigured ? (
            <p className="text-xs" style={{ color: "var(--ink-dim)" }}>
              Admin features aren't configured for this deployment (set
              ADMIN_CODE).
            </p>
          ) : !adminCode ? (
            <div className="flex items-center gap-2">
              <input
                data-testid="admin-code-input"
                value={adminEntry}
                onChange={(e) => setAdminEntry(e.target.value)}
                placeholder="admin code"
                className="flex-1 rounded px-3 py-2 text-sm outline-none"
                style={{
                  background: "var(--panel-2)",
                  border: "1px solid var(--line)",
                  color: "var(--ink)",
                }}
              />
              {adminEntry && verify && !verify.ok && (
                <span className="silkscreen" style={{ fontSize: "0.55rem", color: "var(--alert)" }}>
                  invalid
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between" data-testid="admin-panel">
              <div>
                <div className="text-sm">AI ops assistant</div>
                <div className="text-xs" style={{ color: "var(--ink-dim)" }}>
                  Adds the OPS tab for the whole team
                </div>
              </div>
              <button
                type="button"
                data-testid="ai-flag-toggle"
                onClick={() =>
                  void setFlags({
                    adminCode,
                    aiEnabled: !(config?.aiEnabled ?? true),
                  })
                }
                className="silkscreen rounded px-3 py-2"
                style={{
                  fontSize: "0.62rem",
                  background: config?.aiEnabled ? "var(--rx)" : "var(--panel-2)",
                  color: config?.aiEnabled ? "#0b0d11" : "var(--ink-dim)",
                  border: "1px solid var(--line)",
                }}
              >
                {config?.aiEnabled ? "on" : "off"}
              </button>
            </div>
          )}
        </div>

        <p className="text-xs" style={{ color: "var(--ink-dim)" }}>
          Radio One · issued equipment. Live audio is peer-to-peer; finished
          transmissions are logged for your team's history.
        </p>
      </div>
    </div>
  );
}
