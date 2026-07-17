/**
 * Sender-side transmission recorder (SPEC I3′): captures the local mic track
 * ONLY while the floor is held, yielding a clip blob after release. The live
 * path (WebRTC) is untouched; if MediaRecorder is unavailable the radio simply
 * has no history — never an error the talker can feel.
 *
 * MIME strategy: prefer audio/mp4 (AAC) — every platform plays it back; fall
 * back to webm/opus (Chrome-family recorders), which modern Safari also plays.
 */
const MIME_LADDER = [
  "audio/mp4",
  "audio/webm;codecs=opus",
  "audio/webm",
] as const;

export function pickRecorderMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const mime of MIME_LADDER) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    } catch {
      /* isTypeSupported can throw on odd UAs */
    }
  }
  return null;
}

export interface FinishedClip {
  blob: Blob;
  mimeType: string;
  durationMs: number;
  startedAt: number;
}

export class TransmissionRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private mime: string | null;

  constructor(private track: MediaStreamTrack) {
    this.mime = pickRecorderMime();
  }

  get supported(): boolean {
    return this.mime !== null;
  }

  /** Begin capturing (call right after the floor grant enables the track). */
  start(): void {
    if (!this.mime || this.recorder) return;
    try {
      const stream = new MediaStream([this.track]);
      const recorder = new MediaRecorder(stream, { mimeType: this.mime });
      this.chunks = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) this.chunks.push(e.data);
      };
      recorder.start();
      this.recorder = recorder;
      this.startedAt = Date.now();
    } catch {
      this.recorder = null; // recording is strictly best-effort
    }
  }

  /**
   * Stop and resolve the finished clip (or null if unusable). Safe to call
   * when not recording. MUST be called after the mic track is disabled (I2) —
   * the recorder only ever sees what the mesh already transmitted.
   */
  stop(): Promise<FinishedClip | null> {
    const recorder = this.recorder;
    this.recorder = null;
    if (!recorder || recorder.state === "inactive") {
      return Promise.resolve(null);
    }
    const startedAt = this.startedAt;
    const mimeType = this.mime!;
    return new Promise((resolve) => {
      const timeout = window.setTimeout(() => resolve(null), 5_000);
      recorder.onstop = () => {
        clearTimeout(timeout);
        const durationMs = Date.now() - startedAt;
        const blob = new Blob(this.chunks, { type: mimeType });
        this.chunks = [];
        if (blob.size === 0) return resolve(null);
        resolve({ blob, mimeType, durationMs, startedAt });
      };
      try {
        recorder.stop();
      } catch {
        clearTimeout(timeout);
        resolve(null);
      }
    });
  }

  /** Abandon any in-flight recording (leave/teardown). */
  cancel(): void {
    const recorder = this.recorder;
    this.recorder = null;
    this.chunks = [];
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        /* already dead */
      }
    }
  }
}
