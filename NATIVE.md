# Native deployment path — when the PWA isn't enough

The PWA is the right ship for demos, pilots, and desk-adjacent teams: zero
install friction, one URL, updates on refresh. It has one honest limit that no
web code can fix: **on iOS, a locked screen means no live audio** — the page is
suspended, WebRTC stops, and nothing short of the screen being on brings it
back. The in-app mitigations (screen wake lock while on duty, missed-
transmission push + recorded clips) make the PWA *trustworthy* — you can always
find out what you missed — but a radio that must be *heard* with the phone in a
pocket needs the native path below.

**Positioning: PWA for demos and evaluation; Capacitor + PushToTalk for real
deployments.**

## What Apple built for exactly this

The **PushToTalk framework** (iOS 16+) exists precisely for walkie-talkie apps:

- A **system PTT UI** on the lock screen and Dynamic Island (the blue "pill"):
  users see who's talking and can transmit without unlocking.
- **Background receive**: the system delivers a special APNs push
  (`apns-push-type: pushtotalk`) that wakes the app to play incoming audio even
  when backgrounded or locked.
- A managed audio session: while a PTT channel is joined, the system arbitrates
  mic/speaker access so transmit and receive work like a real radio.

Requirements: the `com.apple.developer.push-to-talk` entitlement, the
`push-to-talk` background mode, and an App Store distribution (this framework
is the one thing you cannot ship over the web).

Android needs no special framework: a **foreground service** with a persistent
notification keeps the mesh and mic alive with the screen off.

## How it maps onto this codebase

The architecture was built so this wrapper is additive, not a rewrite:

1. **Capacitor shell**: wrap the existing Vite build (`npx cap init`, add
   `ios`/`android` platforms). The same React app runs in the shell; the
   Convex control plane, chat, OPS, clips, and design system are untouched.
2. **A small native plugin** bridges Apple's `PTChannelManager` to the web
   layer:
   - `channelManager.requestJoinChannel` mirrors joining a radio channel
     (presence join stays in Convex — the plugin only registers the system UI).
   - The system PTT button's begin/end-transmitting callbacks call the same
     press/release path `useRadio` already exposes; floor arbitration stays
     100% server-side in `convex/floor.ts` (invariant I1 unchanged).
   - On an incoming transmission, the backend sends a `pushtotalk` APNs push
     (server already has the push module; this adds an APNs token type); the
     wake lets the existing WebRTC mesh deliver the live audio (I3′ unchanged —
     live audio stays P2P; nothing routes through the backend).
3. **The radio core doesn't know**: everything behind the `RadioBackend`
   interface and the mesh (`src/lib/radio/`) is identical in PWA and shell.
   The plugin is an input/lifecycle source, exactly like the on-screen PTT key.
4. **Web Push → native push**: in the shell, notification delivery moves from
   VAPID Web Push to APNs/FCM via the same `pushSubs` table (a `platform`
   field per subscription selects the transport in `pushSend`).

## Effort sketch

| Step | Scope |
|---|---|
| Capacitor shell boots the app | ~a day; no code changes to `src/` |
| PTT plugin (iOS): join/leave, talk begin/end, system UI | the real work — a focused week including App Store entitlement request |
| APNs `pushtotalk` sender in `pushSend` | small; keys + a token type |
| Android foreground service | ~two days |
| App Store review + entitlement approval | calendar time; apply early — Apple gates the PTT entitlement on demonstrating a real PTT product |

## What does NOT change

- Half-duplex floor arbitration (I1), no-hot-mic (I2), P2P live path (I3′),
  self-expiring holds/presence (I4/I5), the design system (I8).
- The PWA remains the demo/evaluation ship and keeps working from the same
  repo — the shell is a packaging target, not a fork.
