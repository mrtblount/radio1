/**
 * Radio squelch tones, generated with WebAudio — no assets. The AudioContext is
 * created inside the join tap (user gesture) so iOS allows playback.
 */
let ctx: AudioContext | null = null;

export function initAudio(): void {
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") void ctx.resume();
}

function tone(
  freq: number,
  startInMs: number,
  durationMs: number,
  volume = 0.12,
  type: OscillatorType = "sine",
): void {
  if (!ctx) return;
  const t0 = ctx.currentTime + startInMs / 1000;
  const t1 = t0 + durationMs / 1000;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(volume, t0 + 0.01);
  gain.gain.setValueAtTime(volume, t1 - 0.02);
  gain.gain.linearRampToValueAtTime(0, t1);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t1 + 0.02);
}

/** Channel is yours — two quick rising chirps (talk after the beep). */
export function beepGrant(): void {
  tone(880, 0, 60);
  tone(1320, 70, 80);
}

/** Transmission ended. */
export function beepRelease(): void {
  tone(660, 0, 70);
}

/** Channel busy — low double buzz. */
export function beepBusy(): void {
  tone(220, 0, 90, 0.15, "square");
  tone(180, 110, 120, 0.15, "square");
}

/** Someone else keyed up — quiet tick so heads-down users notice. */
export function beepIncoming(): void {
  tone(1200, 0, 40, 0.06);
}
