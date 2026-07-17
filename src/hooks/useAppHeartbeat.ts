import { useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

const BEAT_MS = 30_000;

/**
 * Marks this user active while the app is open (online dots; push is
 * suppressed for users who are looking at the app anyway).
 */
export function useAppHeartbeat(userId: string | null) {
  const heartbeat = useMutation(api.users.heartbeat);

  useEffect(() => {
    if (!userId) return;
    const beat = () => void heartbeat({ userId }).catch(() => {});
    beat();
    const interval = window.setInterval(beat, BEAT_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") beat();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId, heartbeat]);
}
