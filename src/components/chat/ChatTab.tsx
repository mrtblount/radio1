import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Identity } from "../../hooks/useIdentity";
import { ChannelList } from "./ChannelList";
import { ChatThread, type ThreadTarget } from "./ChatThread";
import { NewChannelSheet } from "./NewChannelSheet";
import { MemberSheet, type TeamMember } from "./MemberSheet";

export interface PendingDm {
  userId: string;
  name: string;
}

/** The App-owned radio, bridged into chat for the inline talk key. */
export interface RadioBridge {
  /** Channel key the radio is live on right now (null = off duty). */
  onChannel: string | null;
  talking: boolean;
  busy: boolean;
  requesting: boolean;
  receiving: boolean;
  join: (channelKey: string) => void;
  pressPTT: () => void;
  releasePTT: () => void;
}

interface Props {
  identity: Identity;
  /** The chat tab is the visible tab (gates read-cursor advancement). */
  visible?: boolean;
  /** Set by the radio roster's MESSAGE action: open this DM on next show. */
  pendingDm?: PendingDm | null;
  onPendingDmConsumed?: () => void;
  /** Notification deep link: open this channel once the list is known. */
  pendingChannelKey?: string | null;
  onPendingChannelConsumed?: () => void;
  /** Switch to the radio on a direct channel (App owns the radio). */
  onGoDirect?: (otherUserId: string, otherName: string) => void;
  radio?: RadioBridge;
}

export function ChatTab({
  identity,
  visible = true,
  pendingDm,
  onPendingDmConsumed,
  pendingChannelKey,
  onPendingChannelConsumed,
  onGoDirect,
  radio,
}: Props) {
  const code = identity.code ? { accessCode: identity.code } : {};
  const channels = useQuery(api.channels.list, {
    userId: identity.userId,
    ...code,
  });
  const createChannel = useMutation(api.channels.create);
  const openDm = useMutation(api.channels.openDm);

  const [thread, setThread] = useState<ThreadTarget | null>(null);
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [showMembers, setShowMembers] = useState(false);

  // Notification deep link: open the channel once the list has loaded.
  useEffect(() => {
    if (!pendingChannelKey || !channels) return;
    onPendingChannelConsumed?.();
    const team = channels.team.find((c) => c.key === pendingChannelKey);
    if (team) {
      setThread({
        key: team.key,
        name: team.name,
        kind: "team",
        mode: team.mode,
        postRestricted: team.postRestricted,
        alertLevel: team.alertLevel,
      });
      return;
    }
    const dm = channels.dms.find((d) => d.key === pendingChannelKey);
    if (dm) {
      setThread({
        key: dm.key,
        name: dm.name,
        kind: "dm",
        postRestricted: false,
        online: dm.online,
        otherUserId: dm.otherUserId,
        alertLevel: dm.alertLevel,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingChannelKey, channels === undefined]);

  // Radio roster's MESSAGE action lands here: open that DM.
  useEffect(() => {
    if (!pendingDm) return;
    onPendingDmConsumed?.();
    void openDm({
      userId: identity.userId,
      otherUserId: pendingDm.userId,
      ...code,
    }).then(({ key }) => {
      setThread({
        key,
        name: pendingDm.name,
        kind: "dm",
        postRestricted: false,
        otherUserId: pendingDm.userId,
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingDm]);

  const openDmWith = async (member: TeamMember) => {
    const { key } = await openDm({
      userId: identity.userId,
      otherUserId: member.userId,
      ...code,
    });
    setShowMembers(false);
    setThread({
      key,
      name: member.name,
      kind: "dm",
      postRestricted: false,
      online: member.online,
      otherUserId: member.userId,
    });
  };

  // Live-refresh DM presence + alert level from the channel list.
  const dmRow = thread ? channels?.dms.find((d) => d.key === thread.key) : null;
  const teamRow = thread
    ? channels?.team.find((c) => c.key === thread.key)
    : null;
  const live = !thread
    ? null
    : dmRow
      ? { ...thread, online: dmRow.online, alertLevel: dmRow.alertLevel }
      : teamRow
        ? { ...thread, alertLevel: teamRow.alertLevel }
        : thread;

  return (
    <div className="flex h-full">
      {/* List: full-screen on mobile (hidden while a thread is open);
          persistent left pane on desktop. */}
      <div
        className={`${thread ? "hidden md:flex" : "flex"} h-full w-full flex-col md:w-[340px] md:shrink-0`}
        style={{ borderRight: "1.5px solid var(--line)" }}
      >
        <ChannelList
          team={channels?.team ?? []}
          dms={channels?.dms ?? []}
          activeKey={thread?.key ?? null}
          onOpenTeam={(c) =>
            setThread({
              key: c.key,
              name: c.name,
              kind: "team",
              mode: c.mode,
              postRestricted: c.postRestricted,
              alertLevel: c.alertLevel,
            })
          }
          onOpenDm={(d) =>
            setThread({
              key: d.key,
              name: d.name,
              kind: "dm",
              postRestricted: false,
              online: d.online,
              otherUserId: d.otherUserId,
              alertLevel: d.alertLevel,
            })
          }
          onNewChannel={() => setShowNewChannel(true)}
          onDirectMessage={() => setShowMembers(true)}
        />
      </div>

      {/* Thread pane */}
      <div
        className={`${thread ? "flex" : "hidden md:flex"} h-full min-w-0 flex-1 flex-col`}
      >
        {live ? (
          <ChatThread
            identity={identity}
            target={live}
            visible={visible}
            onBack={() => setThread(null)}
            onGoDirect={onGoDirect}
            radio={radio}
          />
        ) : (
          <div className="hidden h-full flex-col items-center justify-center gap-3 md:flex">
            <div className="display-num" style={{ fontSize: "2rem", color: "var(--ink-faint)" }}>
              PICK A
              <br />
              CHANNEL
            </div>
            <p className="text-sm" style={{ color: "var(--ink-dim)" }}>
              Everything the team says lands on the left.
            </p>
          </div>
        )}
      </div>
      <NewChannelSheet
        open={showNewChannel}
        onClose={() => setShowNewChannel(false)}
        onCreate={async (name, mode) => {
          const { key } = await createChannel({
            name,
            mode,
            userId: identity.userId,
            ...code,
          });
          setThread({ key, name, kind: "team", mode, postRestricted: false });
        }}
      />
      <MemberSheet
        open={showMembers}
        identity={identity}
        onClose={() => setShowMembers(false)}
        onMessage={(m) => void openDmWith(m)}
      />
    </div>
  );
}
