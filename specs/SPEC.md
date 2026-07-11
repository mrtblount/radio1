# SPEC — Team Radio (Push-to-Talk Web App)

> **Status**: Approved (autonomous session 2026-07-10 — Tony directed end-to-end autonomous
> execution and is away; gates self-approved with rationale recorded here and in PLAN.md.)

## 1. Problem & Context

A volunteer security and parking-lot team needs walkie-talkie-style communication:
press a button, talk, everyone on the channel hears you immediately. Their existing
coordination tools are text-first — too slow for "I need you NOW" moments — and
they've looked at Zello in the past.

The organization has its own member app (React + Vite + Tailwind + Supabase) where
push-to-talk may eventually live. This project builds the PTT capability
**standalone first** so it can be proven on real phones, then integrated or gated
later (see INTEGRATION.md).

## 2. Goals

1. A working, deployed, phone-testable push-to-talk app: open a URL on iPhone Safari or
   Android Chrome, join a channel, hold a button, talk live to everyone else on the channel.
2. Zello-like feel: transmission starts near-instantly on press (<300ms perceived).
3. Built on the host app's stack (React/Vite/Tailwind) with the realtime backend
   isolated behind an interface, so integration into another app is a port, not a rewrite.
4. Zero-friction onboarding for non-technical volunteers: no account creation in the MVP —
   enter a display name, pick a channel, go.

## 3. Non-Goals (MVP)

- Native iOS/Android apps, App Store distribution.
- PTT while the phone is **locked** or the browser is backgrounded — the web platform
  suspends WebRTC/audio when Safari/Chrome backgrounds. Mitigated with the Screen Wake
  Lock API (screen stays on while in a channel); the true locked-screen experience
  requires a native app and is documented as a future step in INTEGRATION.md.
- Recording/replay of transmissions (live-only; nothing is stored).
- User accounts, roles, or channel permissions (the host app's auth will gate access
  after integration).
- Scale beyond ~12 concurrent members per channel (mesh topology; SFU upgrade path
  documented in PLAN.md).

## 4. Users

Security & parking team volunteers (roughly 5–20 people, a handful concurrent per
channel), non-technical, on personal iPhones and Androids, on site WiFi or cellular.

## 5. User Journeys

### J1 — Join a channel
1. Open the app URL → see join screen.
2. Enter display name (remembered on the device for next time).
3. Tap a channel (Security / Parking Lot / General).
4. Grant microphone permission (browser prompt).
5. Land on the channel screen: big PTT button, roster of who's online.

### J2 — Transmit
1. Press and hold the PTT button (or hold spacebar on desktop).
2. Hear a short "channel open" beep; button and screen show ON AIR.
3. Speak; every other member of the channel hears it live.
4. Release; a release beep plays; the channel frees up.

### J3 — Receive
1. While in a channel with the screen on, another member transmits.
2. The listener hears them within ~1 second and sees "«Name» is talking" prominently.

### J4 — Floor contention
1. Member A is transmitting; Member B presses their PTT button.
2. B's button shows "channel busy" feedback (visual + haptic where supported) and B is
   NOT transmitted. B can press again once A releases.

### J5 — Leave / drop
1. A member closes the tab, loses signal, or leaves the channel.
2. Within ~30 seconds they disappear from everyone's roster; if they held the floor,
   it auto-releases within ~10 seconds.

### J6 — Install (optional)
1. From the browser, "Add to Home Screen" installs the PWA with a proper icon/name;
   it opens full-screen like an app.

## 6. Invariants (sacred)

- **I1 — Half-duplex**: at most one member holds the floor (transmits) per channel at any
  moment, arbitrated server-side, never client-side.
- **I2 — No hot mic**: outbound audio is only transmitted while the user actively holds
  the floor. Releasing the button MUST cut transmission immediately and unconditionally.
- **I3 — Live-only**: no audio is ever persisted anywhere (not in the backend, not in
  storage, not in logs).
- **I4 — Self-healing floor**: a crashed or disconnected client can never hold a channel
  hostage — floor holds expire server-side without a heartbeat.
- **I5 — Truthful roster**: the roster only shows members actually reachable (heartbeat
  presence with expiry).

## 7. Acceptance Criteria

- AC1: Two browsers (desktop, different contexts) can join the same channel, and audio
  transmits from one to the other only while PTT is held. (Automated: Playwright with
  fake media devices.)
- AC2: Floor contention: second presser is rejected while first holds the floor. (Automated.)
- AC3: Presence: joining/leaving updates the roster on other clients. (Automated.)
- AC4: Deployed at a public HTTPS URL; app loads and reaches the backend from that URL.
- AC5: PWA manifest + icons + service worker present; Lighthouse-installable.
- AC6: Real-phone verification (iPhone Safari + Android Chrome) — **requires Tony**; a
  step-by-step phone test script is provided in README.md.

## 8. Success Metric

Tony returns, opens the URL on his iPhone and his Android, joins "Security" on both,
holds the button on one, and hears himself on the other — with no setup steps beyond
granting mic permission.
