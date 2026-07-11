# PLAN — Team Radio (Technical Architecture)

> **Status**: Approved (autonomous session 2026-07-10; decisions and their rationale below).

## 1. Stack

| Layer | Choice | Rationale |
|---|---|---|
| Frontend | React 18 + Vite + TypeScript + Tailwind | Matches the host app's stack → later integration is copy-in, not rewrite |
| Audio transport | WebRTC full-mesh (audio only) | True live audio, sub-second latency, no media server to run |
| Realtime backend | Convex (free tier) | Only backend deployable headlessly in this session (CLI authed); reactive queries are ideal for signaling/presence/floor |
| ICE | Google + Cloudflare STUN, OpenRelay (metered.ca) TURN fallback | Free, no account; same-site WiFi use doesn't even need STUN |
| Hosting | Vercel (CLI authed as mrtblount) | Public HTTPS URL — required for getUserMedia on phones |
| PWA | Hand-rolled manifest + minimal service worker | Installable, full-screen; no heavy plugin needed for one route |
| E2E | Playwright (MCP) with `--use-fake-device-for-media-stream` | Two-context PTT flow testable without hardware |

### Deviations from house process (recorded per SDD rules)
- **Human gates self-approved**: Tony explicitly directed autonomous end-to-end execution.
- **build-fleet harness not used**: ~20 tightly-coupled files where the WebRTC hook, floor
  state, and signaling contract interlock; parallel per-file generation risks seam bugs that
  cost more than the scaffold saves. Implemented sequentially against this plan instead.
- **design-direction-pipeline not run**: it requires human taste gates (unavailable).
  A single self-selected design direction is used (see §7), guided by the design-taste skill.
- **Backend is Convex, not Supabase** (the host app's backend): no Supabase auth available
  in this session. All backend calls are isolated in `src/lib/radio/` behind small interfaces
  (`PresenceClient`, `FloorClient`, `SignalingClient`) so the Supabase Realtime port is
  mechanical — mapping table in INTEGRATION.md.

## 2. System Architecture

```
┌──────── Phone A (Safari) ────────┐        ┌──────── Phone B (Chrome) ───────┐
│ React PWA                        │        │ React PWA                       │
│  ├─ presence heartbeat ──────────┼──┐  ┌──┼── presence heartbeat            │
│  ├─ floor acquire/release ───────┼──┤  ├──┼── floor state (reactive)        │
│  ├─ WebRTC signaling msgs ───────┼──┤  ├──┼── WebRTC signaling msgs         │
│  └─ RTCPeerConnection ═══ live Opus audio (P2P, STUN/TURN) ═══ ────────────►│
└──────────────────────────────────┘  │  │  └─────────────────────────────────┘
                                   ┌──▼──▼──┐
                                   │ Convex │  (control plane only — no audio ever)
                                   └────────┘
```

- **Control plane** (Convex): who's here, who may talk, offer/answer/ICE relay.
- **Media plane** (WebRTC mesh): audio flows peer-to-peer; Convex never sees audio (I3).

## 3. Key Design Decisions

### D1 — Pre-established mesh + track toggle (the "instant PTT" trick)
Connections between all channel members are negotiated **at join time**, each with the
local mic track attached but `track.enabled = false`. Pressing PTT then does only:
(1) floor-acquire mutation, (2) `track.enabled = true`. No renegotiation on press →
transmission starts in ~100–300ms, Zello-like.

Tradeoff: the mic stays "acquired" while in a channel (OS shows the mic-in-use
indicator). Accepted for MVP — it is the price of instant PTT on the web; `enabled=false`
means silence is transmitted as no packets (RTP mute), and I2 (no hot mic) is enforced
by the toggle + floor check on receivers' UI. Documented in README.

### D2 — Server-arbitrated floor with expiry heartbeat (I1, I4)
`floor` table, one row per channel. Acquire = transactional Convex mutation that fails
if an unexpired row exists for the channel. While talking, the client renews
`expiresAt` (+10s) every 5s. Release deletes the row. A Convex cron sweeps expired
rows every few seconds as backstop. Client-side, PTT button state derives from the
reactive floor query.

### D3 — Newcomer initiates; "perfect negotiation" handles glare
The joining client creates offers to every existing member (learned from the presence
query). Each pair also runs the [perfect negotiation](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation)
pattern with politeness decided by `sessionId` string comparison, so simultaneous joins
or ICE restarts can't deadlock.

### D4 — Signaling as consumable Convex rows
`signals` table: `{toSession, fromSession, channel, kind: "offer"|"answer"|"ice", payload(JSON string), createdAt}`.
Receiver subscribes to `signals.for(mySession)` reactively, processes in order, then
deletes processed rows by id. Cron sweeps rows older than 60s (dead recipients).

### D5 — Presence = heartbeat rows + cron sweep (I5)
`members` table: `{sessionId, name, channel, joinedAt, lastSeen}`. Heartbeat mutation
every 10s. Roster query returns rows with `lastSeen > now-30s`; cron deletes stale rows
(deletion triggers reactive roster updates on other clients). `sessionId` is a
crypto-random id minted per join and kept in `sessionStorage`.

### D6 — iOS realities
- getUserMedia + AudioContext are created inside the **join tap** handler (user gesture).
- Remote audio: one `<audio autoplay playsinline>` element per peer, created after the
  join gesture → passes autoplay policy.
- **Screen Wake Lock** requested while in a channel (re-acquired on `visibilitychange`).
- On `visibilitychange → visible` and on `pageshow`, the mesh reconciles: dead peer
  connections (`iceConnectionState` failed/disconnected) are torn down and re-offered.
- Documented limit: locked screen / backgrounded browser suspends audio (SPEC non-goal).

### D7 — Radio ergonomics
- Hold-to-talk via Pointer Events (`pointerdown/up/cancel` + `setPointerCapture`,
  `touch-action: none`, `user-select: none`) — no 300ms tap delay, no context menu.
- Spacebar PTT on desktop.
- WebAudio-generated squelch beeps (floor granted / released / busy) — oscillator, no
  audio assets. Haptic tick via `navigator.vibrate` where available (Android).
- Max transmission length 60s (auto-release; radio discipline + battery).

## 4. Backend Contract (Convex functions)

| Function | Type | Signature (conceptual) |
|---|---|---|
| `presence.join` | mutation | `(sessionId, name, channel) → void` |
| `presence.heartbeat` | mutation | `(sessionId) → void` (also renews floor if held) |
| `presence.leave` | mutation | `(sessionId) → void` (drops floor, deletes signals) |
| `presence.roster` | query | `(channel) → Member[]` (fresh only) |
| `floor.acquire` | mutation | `(sessionId, channel) → {granted: boolean}` |
| `floor.release` | mutation | `(sessionId, channel) → void` (only own floor) |
| `floor.current` | query | `(channel) → {sessionId, name, since} \| null` |
| `signaling.send` | mutation | `(fromSession, toSession, channel, kind, payload) → void` |
| `signaling.inbox` | query | `(toSession) → Signal[]` |
| `signaling.consume` | mutation | `(ids[]) → void` |
| `maintenance.sweep` | internal cron (5s floor / 60s members+signals) | expire floor rows, stale members, old signals |

## 5. Frontend Structure

```
src/
  main.tsx, App.tsx                 — screen switch: Join ⇄ Channel
  lib/radio/types.ts                — Member, FloorState, Signal, RadioBackend interfaces
  lib/radio/convexBackend.ts        — the ONLY file that imports Convex (swap point for Supabase)
  lib/radio/session.ts              — sessionId mint, display-name persistence
  lib/radio/beeps.ts                — WebAudio squelch tones
  hooks/useRadio.ts                 — orchestrates presence + floor + mesh; exposes one state object
  hooks/useWebRTCMesh.ts            — peer lifecycle, perfect negotiation, track toggle
  components/JoinScreen.tsx
  components/ChannelScreen.tsx      — roster, on-air banner, leave
  components/PTTButton.tsx          — pointer handling, states: idle/talking/busy/receiving
convex/
  schema.ts, presence.ts, floor.ts, signaling.ts, maintenance.ts, crons.ts
```

## 6. Failure Modes & Handling

| Failure | Handling |
|---|---|
| Mic permission denied | Join blocked with plain-language instructions per platform |
| Peer connection fails (NAT) | ICE restart once; TURN fallback in ICE config; peer shown with ⚠ "can't hear" badge if still failed |
| Talker's app dies mid-transmission | Floor expires ≤10s (D2); listeners' UI clears via reactive query |
| Backend unreachable | Banner "reconnecting…"; Convex client auto-reconnects; PTT disabled meanwhile |
| Two joins same instant | Perfect negotiation (D3) resolves glare |
| Tab backgrounded on iOS | Wake lock while in channel; reconcile mesh on return (D6) |

## 7. Design Direction (self-selected)

"**Field radio, not chat app**": dark graphite UI (outdoor/night parking-lot legibility,
battery-friendly on OLED), one dominant circular PTT control sized for a gloved thumb
(~45% of viewport width), amber ON AIR states, green "receiving" states, roster as a
quiet secondary list. Typography: system stack, large sizes, high contrast. No
navigation, no settings screen — the entire app is two screens.

## 8. Scale Path (documented, not built)

Mesh uplink cost is on the **talker** (N−1 encodes, ~30kbps each). Fine to ~12 members
per channel. Past that: swap `useWebRTCMesh` for a LiveKit SFU client — floor control,
presence, and UI are unaffected (they sit behind the `RadioBackend` interface). Noted
in INTEGRATION.md with effort estimate.
