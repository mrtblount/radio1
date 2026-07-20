import { useCallback, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  forceGate,
  getUserId,
  isEphemeralSession,
  isIdentified,
  loadAccessCode,
  loadDisplayName,
  saveIdentity,
} from "../lib/platform/identity";

export interface Identity {
  userId: string;
  name: string;
  code: string;
}

/** Exact copy shown for a call-sign conflict — App matches on it to tell a
 *  lost gate race apart from transient failures. */
export const NAME_TAKEN_MSG =
  "That call sign is in use on this team. Pick another.";

/**
 * Device identity: userId is minted locally; `identify` registers/refreshes
 * the server row (validating the access code) and persists the gate pass.
 */
export function useIdentity() {
  const [identified, setIdentified] = useState(isIdentified);
  const upsert = useMutation(api.users.upsert);

  const identity: Identity = {
    userId: getUserId(),
    name: loadDisplayName(),
    code: loadAccessCode(),
  };

  /** Returns an error message, or null on success. */
  const identify = useCallback(
    async (name: string, code: string): Promise<string | null> => {
      try {
        const res = await upsert({
          userId: getUserId(),
          name,
          accessCode: code || undefined,
          ephemeral: isEphemeralSession() || undefined,
        });
        if (!res.ok) {
          if (res.reason === "name-taken") return NAME_TAKEN_MSG;
          return res.reason === "code-invalid"
            ? "That access code isn't right. Check with your team lead and try again."
            : "This team requires an access code — ask your team lead for it.";
        }
      } catch {
        return "Couldn't reach the server. Check your connection and try again.";
      }
      saveIdentity(name, code);
      setIdentified(true);
      return null;
    },
    [upsert],
  );

  /** Server refused our persisted identity (e.g. call sign taken while we
   *  were offline): drop back to the gate, this session and the next. */
  const revoke = useCallback(() => {
    forceGate();
    setIdentified(false);
  }, []);

  return { identified, identity, identify, revoke };
}
