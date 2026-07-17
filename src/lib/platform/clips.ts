/**
 * Clip upload — fire-and-forget from the radio's perspective. Lives in the
 * platform layer (uses Convex directly per PLAN D12) so the radio core stays
 * behind RadioBackend; useRadio only calls this one function after release.
 */
import { convexClient } from "../convexClient";
import { api } from "../../../convex/_generated/api";
import { getUserId, loadAccessCode } from "./identity";
import type { FinishedClip } from "../radio/recorder";

export async function uploadTransmission(
  clip: FinishedClip,
  channelKey: string,
  sessionId: string,
): Promise<void> {
  const code = loadAccessCode();
  const codeArg = code ? { accessCode: code } : {};

  const attempt = async () => {
    const url = await convexClient.mutation(api.transmissions.uploadUrl, {
      ...codeArg,
    });
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": clip.mimeType },
      body: clip.blob,
    });
    if (!res.ok) throw new Error(`upload ${res.status}`);
    const { storageId } = (await res.json()) as { storageId: string };
    await convexClient.mutation(api.transmissions.record, {
      channelKey,
      userId: getUserId(),
      sessionId,
      startedAt: clip.startedAt,
      durationMs: clip.durationMs,
      storageId: storageId as never,
      mimeType: clip.mimeType,
      ...codeArg,
    });
  };

  try {
    await attempt();
  } catch {
    try {
      await attempt(); // one retry, then drop — live PTT never feels this
    } catch (err) {
      console.warn("[clips] upload dropped", err);
    }
  }
}
