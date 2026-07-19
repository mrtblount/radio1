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
}

export function ChatTab({
  identity,
  visible = true,
  pendingDm,
  onPendingDmConsumed,
  pendingChannelKey,
  onPendingChannelConsumed,
  onGoDirect,
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
        postRestricted: team.postRestricted,
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

  if (thread) {
    // Live-refresh DM presence from the channel list when available.
    const dmRow = channels?.dms.find((d) => d.key === thread.key);
    return (
      <ChatThread
        identity={identity}
        target={dmRow ? { ...thread, online: dmRow.online } : thread}
        visible={visible}
        onBack={() => setThread(null)}
        onGoDirect={onGoDirect}
      />
    );
  }

  return (
    <>
      <ChannelList
        team={channels?.team ?? []}
        dms={channels?.dms ?? []}
        onOpenTeam={(c) =>
          setThread({
            key: c.key,
            name: c.name,
            kind: "team",
            postRestricted: c.postRestricted,
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
          })
        }
        onNewChannel={() => setShowNewChannel(true)}
        onDirectMessage={() => setShowMembers(true)}
      />
      <NewChannelSheet
        open={showNewChannel}
        onClose={() => setShowNewChannel(false)}
        onCreate={async (name) => {
          const { key } = await createChannel({
            name,
            userId: identity.userId,
            ...code,
          });
          setThread({ key, name, kind: "team", postRestricted: false });
        }}
      />
      <MemberSheet
        open={showMembers}
        identity={identity}
        onClose={() => setShowMembers(false)}
        onMessage={(m) => void openDmWith(m)}
      />
    </>
  );
}
