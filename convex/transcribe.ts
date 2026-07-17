"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const MODEL = "whisper-large-v3-turbo";

/**
 * Transcribe a finished transmission via Groq Whisper (the house convention:
 * Groq = transcription only). No GROQ_API_KEY → status "skipped"; the clip
 * stays fully usable either way.
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
    if (!row?.url) return;

    try {
      const audio = await fetch(row.url);
      if (!audio.ok) throw new Error(`clip fetch ${audio.status}`);
      const blob = await audio.blob();

      const ext = row.mimeType.includes("mp4") ? "mp4" : "webm";
      const form = new FormData();
      form.append("file", blob, `clip.${ext}`);
      form.append("model", MODEL);
      form.append("response_format", "json");

      const res = await fetch(GROQ_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      });
      if (!res.ok) {
        throw new Error(`groq ${res.status}: ${(await res.text()).slice(0, 200)}`);
      }
      const data = (await res.json()) as { text?: string };
      const transcript = (data.text ?? "").trim();

      await ctx.runMutation(internal.transmissions.setTranscript, {
        transmissionId,
        transcript: transcript || undefined,
        status: transcript ? "done" : "failed",
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
