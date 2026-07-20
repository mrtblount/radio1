"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const MODEL = "whisper-large-v3-turbo";

// Mirrors transmissions.MIN_TRANSCRIBE_MS (kept literal — this file bundles
// for the node runtime and must not import the mutation module).
const MIN_TRANSCRIBE_MS = 1000;

/** Whisper verbose_json segment stats (both fields may be absent — type defensively). */
type Segment = {
  start?: number;
  end?: number;
  avg_logprob?: number;
  no_speech_prob?: number;
};

/**
 * Short-burst hallucinations ("Það er það.") show up as very negative
 * log-probs or high no-speech probability. Duration-weighted so one long
 * clean segment isn't outvoted by a trailing sliver.
 */
function deriveConfidence(segments: Segment[] | undefined): "ok" | "low" | undefined {
  if (!segments?.length) return undefined;
  let weighted = 0;
  let weight = 0;
  let maxNoSpeech = 0;
  for (const s of segments) {
    if (typeof s.avg_logprob === "number") {
      const w = Math.max((s.end ?? 0) - (s.start ?? 0), 0.1);
      weighted += s.avg_logprob * w;
      weight += w;
    }
    if (typeof s.no_speech_prob === "number") {
      maxNoSpeech = Math.max(maxNoSpeech, s.no_speech_prob);
    }
  }
  if (weight === 0 && maxNoSpeech === 0) return undefined;
  const avgLogprob = weight > 0 ? weighted / weight : 0;
  return avgLogprob < -0.6 || maxNoSpeech > 0.5 ? "low" : "ok";
}

/**
 * Transcribe a finished transmission via Groq Whisper (the house convention:
 * Groq = transcription only). No GROQ_API_KEY → status "skipped"; the clip
 * stays fully usable either way. Language pinned per deployment (D19).
 */
export const run = internalAction({
  args: { transmissionId: v.id("transmissions") },
  handler: async (ctx, { transmissionId }) => {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      await ctx.runMutation(internal.transmissions.setTranscript, {
        transmissionId,
        status: "skipped",
      });
      return;
    }

    const row = await ctx.runQuery(internal.transmissions.getForTranscription, {
      transmissionId,
    });
    if (!row) return; // row deleted — nothing to patch
    if (row.durationMs < MIN_TRANSCRIBE_MS) {
      // Belt-and-braces: record normally gates this before scheduling.
      await ctx.runMutation(internal.transmissions.setTranscript, {
        transmissionId,
        status: "too_short",
      });
      return;
    }
    if (!row.url) {
      // A missing blob can never transcribe — don't leave "pending" forever.
      await ctx.runMutation(internal.transmissions.setTranscript, {
        transmissionId,
        status: "failed",
      });
      return;
    }

    try {
      const audio = await fetch(row.url);
      if (!audio.ok) throw new Error(`clip fetch ${audio.status}`);
      const blob = await audio.blob();

      const ext = row.mimeType.includes("mp4") ? "mp4" : "webm";
      const form = new FormData();
      form.append("file", blob, `clip.${ext}`);
      form.append("model", MODEL);
      // Pinned language kills the short-burst wrong-language hallucination;
      // per-deployment override for non-English teams (documented in CLAUDE.md).
      form.append("language", process.env.STT_LANGUAGE ?? "en");
      form.append("response_format", "verbose_json");

      const res = await fetch(GROQ_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      });
      if (!res.ok) {
        throw new Error(`groq ${res.status}: ${(await res.text()).slice(0, 200)}`);
      }
      const data = (await res.json()) as {
        text?: string;
        segments?: Segment[];
      };
      const transcript = (data.text ?? "").trim();

      await ctx.runMutation(internal.transmissions.setTranscript, {
        transmissionId,
        transcript: transcript || undefined,
        status: transcript ? "done" : "failed",
        confidence: transcript ? deriveConfidence(data.segments) : undefined,
      });
    } catch (err) {
      console.warn("[transcribe] failed", err);
      await ctx.runMutation(internal.transmissions.setTranscript, {
        transmissionId,
        status: "failed",
      });
    }
  },
});
