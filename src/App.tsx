import { useCallback, useEffect, useRef, useState } from "react";
import { useConvex, useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { useRadio } from "./hooks/useRadio";
import { NAME_TAKEN_MSG, useIdentity } from "./hooks/useIdentity";
import { useAppHeartbeat } from "./hooks/useAppHeartbeat";
import { forceGate, loadAccessCode } from "./lib/platform/identity";
import { beepIncoming } from "./lib/radio/beeps";
import { JoinScreen } from "./components/JoinScreen";
import { ChannelScreen, type DirectInfo } from "./components/ChannelScreen";
import { ChannelSelect } from "./components/ChannelSelect";
import { TabBar, type ShellTab } from "./components/shell/TabBar";
import { SettingsSheet } from "./components/shell/SettingsSheet";
import { ChatTab, type PendingDm } from "./components/chat/ChatTab";
import { OpsTab } from "./components/ops/OpsTab";
import { setAppBadge } from "./lib/platform/notifications";

interface DirectState {
  key: string;
  otherName: string;
  returnChannel: string | null;
}

export default function App() {
  const { state, join, leave, pressPTT, releasePTT, setKeepAwake } = useRadio();
  const { identified, identity, identify, revoke } = useIdentity();
  const convex = useConvex();
  const [tab, setTab] = useState<ShellTab>("radio");
  const [gateError, setGateError] = useState<string | null>(null);
  const [direct, setDirect] = useState<DirectState | null>(null);
  const [pendingDm, setPendingDm] = useState<PendingDm | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [pendingChannelKey, setPendingChannelKey] = useState<string | null>(
    null,
  );

  const codeArg = identity.code ? { accessCode: identity.code } : {};
  const config = useQuery(api.settings.teamConfig);
  const ensureSeeded = useMutation(api.channels.ensureSeeded);
  const openDirect = useMutation(api.directCalls.openDirect);
  const consumeCall = useMutation(api.directCalls.consume);
  useAppHeartbeat(identified ? identity.userId : null);
  const unread = useQuery(
    api.messages.unreadSummary,
    identified ? { userId: identity.userId, ...codeArg } : "skip",
  );
  const rings = useQuery(
    api.directCalls.incoming,
    identified ? { toUserId: identity.userId, ...codeArg } : "skip",
  );

  // A fresh device's first successful radio join doubles as the identity gate.
  // Belt for the gate race: the JoinScreen pre-checks the call sign, but if a
  // second device claims it between check and upsert, drop back to the gate —
  // a persisted name with no server row would strand the device half-in.
  useEffect(() => {
    if (!identified && state.screen === "channel") {
      void identify(state.name, loadAccessCode()).then((err) => {
        if (err === NAME_TAKEN_MSG) {
          leave();
          forceGate();
          setGateError(err);
        }
      });
    }
  }, [identified, state.screen, state.name, identify, leave]);

  // Backfill: upgraded v1 devices are already "identified" (stored name) but
  // have no server users row — upsert once on load (idempotent). A name-taken
  // refusal here means the persisted call sign was claimed while this device
  // had no row (a lost gate race that outlived its session): silently
  // swallowing it would strand the device rowless forever — un-mentionable,
  // un-DM-able, invisible to push. Back to the gate instead.
  useEffect(() => {
    if (identified) {
      void identify(identity.name, identity.code).then((err) => {
        if (err === NAME_TAKEN_MSG) {
          leave();
          revoke();
          setGateError(err);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Make sure the seeded channels exist once we're in.
  useEffect(() => {
    if (!identified) return;
    void ensureSeeded({
      ...(identity.code ? { accessCode: identity.code } : {}),
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identified]);

  // Notification deep links: /#chat/<channelKey> — from a cold open (hash)
  // or a warm one (message from the service worker's notificationclick).
  useEffect(() => {
    const openFromUrl = (url: string) => {
      const match = /#chat\/(.+)$/.exec(url);
      if (match) {
        setPendingChannelKey(decodeURIComponent(match[1]));
        setTab("chat");
      }
    };
    openFromUrl(window.location.hash);
    const onMessage = (e: MessageEvent) => {
      if (e.data?.kind === "open" && typeof e.data.url === "string") {
        openFromUrl(e.data.url);
      }
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () =>
      navigator.serviceWorker?.removeEventListener("message", onMessage);
  }, []);

  // Keep the app-icon badge honest.
  useEffect(() => {
    setAppBadge((unread?.total ?? 0) + (unread?.mutedMentions ?? 0));
  }, [unread?.total, unread?.mutedMentions]);

  // ── Direct PTT (PLAN D8): caller side ────────────────────────────────────
  const goDirect = useCallback(
    async (otherUserId: string, otherName: string) => {
      try {
        const { key } = await openDirect({
          userId: identity.userId,
          otherUserId,
          ...(identity.code ? { accessCode: identity.code } : {}),
        });
        // Chained directs keep the original team channel as the way back.
        const returnChannel =
          state.screen === "channel" && !state.channel.startsWith("dm_")
            ? state.channel
            : (direct?.returnChannel ?? null);
        // Unconditional: also invalidates any in-flight join (epoch bump).
        leave();
        setDirect({ key, otherName, returnChannel });
        setTab("radio");
        void join(identity.name, key, identity.code);
      } catch (err) {
        console.warn("[direct] open failed", err);
      }
    },
    [openDirect, identity, state.screen, state.channel, direct, leave, join],
  );

  // ── Direct PTT: callee side — auto-switch while on the radio ─────────────
  const answeredRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!rings || rings.length === 0) return;
    const ring = rings[0];
    if (answeredRef.current.has(ring.id)) return;
    // Only a client that actually answers consumes the ring — a chat-only tab
    // must not eat a call meant for the phone that's on the air. Unanswered
    // rings expire server-side.
    if (state.screen !== "channel") return; // off the radio → clip + push cover it
    if (state.channel === ring.channelKey) return; // already on the call

    answeredRef.current.add(ring.id);
    void consumeCall({
      id: ring.id,
      ...(identity.code ? { accessCode: identity.code } : {}),
    }).catch(() => {});

    const returnChannel = state.channel.startsWith("dm_")
      ? (direct?.returnChannel ?? null)
      : state.channel;
    leave();
    beepIncoming();
    setDirect({ key: ring.channelKey, otherName: ring.fromName, returnChannel });
    setTab("radio");
    void join(identity.name, ring.channelKey, identity.code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rings, state.screen, state.channel]);

  const returnFromDirect = useCallback(() => {
    const back = direct?.returnChannel ?? null;
    setDirect(null);
    leave();
    if (back) void join(identity.name, back, identity.code);
  }, [direct, leave, join, identity]);

  // Direct framing only applies while actually on that dm channel.
  const directInfo: DirectInfo | null =
    direct && state.screen === "channel" && state.channel === direct.key
      ? { otherName: direct.otherName, onReturn: returnFromDirect }
      : null;

  // ── Identity gate (first run): the v1 join screen, verbatim ──────────────
  // A successful radio join shows the shell immediately; the identity upsert
  // catches up asynchronously (name/code are already persisted by join()).
  if (!identified && state.screen !== "channel") {
    return (
      <JoinScreen
        joining={state.joining}
        joinError={state.joinError ?? gateError}
        onJoin={(name, channel, accessCode) => {
          setGateError(null);
          void join(name, channel, accessCode);
        }}
        onChatOnly={identify}
        checkName={(name, accessCode) =>
          convex.query(api.users.nameAvailable, {
            userId: identity.userId,
            name,
            ...(accessCode ? { accessCode } : {}),
          })
        }
      />
    );
  }

  const showOps = config?.aiEnabled ?? false;
  const activeTab: ShellTab = tab === "ops" && !showOps ? "radio" : tab;

  return (
    <div className="mx-auto flex h-full max-w-md flex-col">
      <div className="min-h-0 flex-1">
        {/* Tabs stay mounted — switching never tears down the radio (I6). */}
        <div className={activeTab === "radio" ? "h-full" : "hidden"}>
          {state.screen === "channel" ? (
            <ChannelScreen
              state={state}
              sessionId={state.sessionId}
              active={activeTab === "radio"}
              direct={directInfo}
              onPressStart={() => {
                void pressPTT();
              }}
              onPressEnd={releasePTT}
              onLeave={() => {
                setDirect(null);
                leave();
              }}
              onMessageMember={(userId, name) => {
                setPendingDm({ userId, name });
                setTab("chat");
              }}
              onGoDirectMember={(userId, name) => {
                void goDirect(userId, name);
              }}
            />
          ) : (
            <ChannelSelect
              accessCode={identity.code}
              joining={state.joining}
              joinError={state.joinError}
              onPick={(channelKey) => {
                void join(identity.name, channelKey, identity.code);
              }}
            />
          )}
        </div>
        <div className={activeTab === "chat" ? "h-full" : "hidden"}>
          <ChatTab
            identity={identity}
            visible={activeTab === "chat"}
            pendingDm={pendingDm}
            onPendingDmConsumed={() => setPendingDm(null)}
            pendingChannelKey={pendingChannelKey}
            onPendingChannelConsumed={() => setPendingChannelKey(null)}
            onGoDirect={(otherUserId, otherName) => {
              void goDirect(otherUserId, otherName);
            }}
          />
        </div>
        {showOps && (
          <div className={activeTab === "ops" ? "h-full" : "hidden"}>
            <OpsTab
              identity={identity}
              onOpenChannel={(channelKey) => {
                setPendingChannelKey(channelKey);
                setTab("chat");
              }}
            />
          </div>
        )}
      </div>
      <TabBar
        tab={activeTab}
        onTab={setTab}
        showOps={showOps}
        chatUnread={unread?.total ?? 0}
        chatMentions={unread?.mentions ?? 0}
        radioActive={state.screen === "channel"}
        onSettings={() => setShowSettings(true)}
      />
      <SettingsSheet
        open={showSettings}
        identity={identity}
        onClose={() => setShowSettings(false)}
        onKeepAwakeChange={setKeepAwake}
      />
    </div>
  );
}
