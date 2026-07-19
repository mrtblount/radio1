# SPEC — Radio One Platform (PTT Radio · Team Chat · AI Ops)

> **Status**: v2.1 — Approved (v2 approved 2026-07-17; §9 field-feedback amendment
> added 2026-07-18 from Tony's first field trial, autonomous session, gates
> self-approved per his direction. Decisions recorded here and in PLAN.md §Decisions.)
> v1 (2026-07-10, PTT-only MVP) is superseded by this document; v1 invariants carry
> forward except where explicitly amended (see I3′).

## 1. Problem & Context

Field and volunteer teams (security, parking, events, retail floors) need
three kinds of communication that today live in three different apps:

1. **Live voice** — "I need you NOW": push-to-talk, one button, everyone hears you.
   (Built and shipped as Radio One v1; one pilot team is replacing a commercial
   PTT app with it.)
2. **Team text** — Slack-like channels, DMs, announcements. Another pilot team
   lives in chat today, but their current chat is slow to open and buried behind
   navigation — adoption suffers.
3. **An ops agent** — a single AI thread that sees the team's operational data and
   answers/acts, presenting whatever UI the answer needs (prototyped as a
   standalone "ops single-thread" on the owner's sibling platform).

This project fuses all three into the existing Radio One PWA as one mobile-first app
with three surfaces, sold as one product with per-team feature toggles (AI is a paid
add-on). The long-term thesis (recorded, not all built now): interfaces collapse into
a single multimodal thread — one voice over everything.

## 2. Goals

1. **Zero degradation of PTT.** The radio works exactly as well as v1 — same
   immediacy (<300ms perceived), same screens, same feel. The v1 e2e suite must pass
   unchanged.
2. **Transmission history**: every radio transmission is recorded at the sender,
   uploaded after release, playable later, and transcribed. "If you didn't hear it,
   you can still know what they said."
3. **Direct (1:1) PTT**: reach one online person without the whole team hearing —
   from the radio roster or from chat.
4. **Team chat that opens instantly**: channels (create/archive), DMs, announcements,
   unread badges — realtime, no loading spinner culture.
5. **AI ops thread** (feature-flagged): single thread, collapsible 3-card dashboard
   strip, agent answers from live team data using a constrained generative-UI block
   system.
6. **Alerts**: push notifications for messages, DMs, announcements, and missed
   transmissions — delivered when the app is minimized or the screen is off, as close
   to native as the web platform allows (installed-PWA Web Push).
7. **One cohesive look**: the "issued equipment" radio design language extends over
   chat and ops; the ops thread's minimal single-column feel and blinking status lamp
   motif are preserved. Mobile-first on all phone sizes; desktop later.

## 3. Non-Goals (this pass)

- Native apps / App Store distribution (Web Push on installed PWA is the ceiling).
- Guaranteed audio while screen is locked (web platform limit; wake lock + push
  notifications are the mitigations; documented honestly in-app).
- Accounts/passwords. Identity stays device-local (name + stable device id) behind
  the shared access code, as in v1.
- Standalone chat-only app and mirroring into the owner's sibling platform
  (architecture must not preclude it; not built now).
- User-designable dashboard cards (defaults only this pass; the block system is the
  foundation for it).
- SFU scale-out beyond ~12 concurrent per radio channel (unchanged from v1).
- Voice input to the AI thread; agent-initiated announcements (roadmap).

## 4. Users

Same as v1 (5–20 non-technical volunteers/staff per team, personal iPhones/Androids,
site WiFi or cellular) plus a team lead/owner acting as admin (channel management,
feature toggles) and a platform admin (Tony) selling feature bundles per team.

## 5. User Journeys

### J1 — First open (identity gate)
1. Open the app → the Team Radio branded entry screen (v1 join screen look).
2. Enter display name (+ access code if the deployment requires it) once.
3. Land in the app shell: three tabs — RADIO · CHAT · OPS (OPS only if enabled).
   The device remembers identity; next open goes straight to the shell.

### J2 — Radio (unchanged from v1)
Pick a channel inside the RADIO tab → grant mic → big PTT key, roster, ON AIR /
receiving states, off duty. All v1 journeys (transmit, receive, contention,
leave/drop) hold verbatim.

### J3 — Transmission history & playback
1. In the RADIO tab, open the LOG sheet (or see clips inline in the channel's chat).
2. Every finished transmission appears with talker, time, duration; tap ▶ to play.
3. Expand a clip to read its transcript (auto-generated within ~seconds; "…" while
   pending).
4. Clips also land in the matching chat channel timeline, so text + voice history
   read as one stream and unread badges cover both.

### J4 — Direct PTT (1:1)
1. From the radio roster or a chat member list, tap a person who is online.
2. Choose "GO DIRECT" → you switch to a private direct channel with them; the PTT
   key now reaches only them. A clear "DIRECT · «name»" banner + return path back to
   the team channel.
3. The other side hears the transmission live if they're on radio; otherwise they get
   a missed-transmission push and the clip in the DM thread.

### J5 — Chat
1. CHAT tab opens instantly to the channel list: team channels, Announcements, DMs,
   unread badges.
2. Open a channel → realtime thread (newest at bottom), composer, send — appears on
   all devices immediately.
3. Long-press/plus: create channel; admins can archive. DM anyone from the member
   list. Announcements channel: admin-posted, pushed to everyone.
4. From a DM header: see online state; PTT them directly (J4).

### J6 — AI ops thread (if enabled for the team)
1. OPS tab → single thread, minimal. Top: dashboard strip, three cards (On Duty ·
   Missed · Checklist) — collapsible chevron; the app remembers your preference.
2. Ask anything ops: "who's on duty?", "what did I miss on Security in the last
   hour?", "add 'check west gate' to the checklist".
3. The agent answers with blocks — text, stat cards, a small chart, a checklist,
   action buttons — chosen by the agent, rendered natively in the app's design
   system. While it works, the status lamp blinks.

### J7 — Alerts
1. In Settings (gear on the shell), enable notifications (browser permission flow;
   on iPhone the app explains Home-Screen install first).
2. With the app minimized or screen off: DMs, announcements, channel messages, and
   missed transmissions arrive as push notifications; tapping one opens the right
   tab/channel. App icon shows a badge count where supported.

### J8 — Admin
1. Settings → "Team setup" unlocks with the admin code (env-controlled, like the
   access code).
2. Toggle AI on/off for the team; manage channels (create/archive); manage the
   daily checklist template.

## 6. Invariants (sacred)

- **I1 — Half-duplex**: unchanged. One floor holder per channel, server-arbitrated
  (this now covers direct channels too — they are channels).
- **I2 — No hot mic**: unchanged. Release cuts the mic before any async work —
  including before recorder stop/upload.
- **I3′ — Live path is P2P; history is explicit** *(AMENDED 2026-07-17 by owner
  request — v1 said "no audio is ever persisted"; playback/transcripts require
  persistence)*: live audio still flows only peer-to-peer; no live audio routes
  through the backend. Additionally, the **sender's device** records its own
  transmission while the floor is held and uploads the finished clip afterward for
  history/playback/transcription. No third party records; nothing is captured while
  the floor is not held; upload failure never blocks or degrades live PTT.
- **I4 — Self-healing floor**: unchanged (holds expire server-side).
- **I5 — Truthful roster**: unchanged (heartbeat presence with expiry).
- **I6 — Instant surfaces**: switching tabs never tears down the radio: the mesh,
  mic, and channel membership survive tab switches. Chat opens with locally cached
  data instantly and reconciles live.
- **I7 — Flags gate features**: a disabled feature (e.g., AI) is invisible —
  no tab, no dead buttons; toggling requires no redeploy.
- **I8 — One design system**: every new surface uses the issued-equipment tokens
  (chassis/panel/ink/tx/rx, Saira Condensed + Barlow, silkscreen labels, LED lamps).
  No second visual language.

## 7. Acceptance Criteria

- AC1–AC5 (v1): the existing e2e suite passes unchanged (two-browser join, live
  audio energy while PTT held, contention, roster convergence, silence outside
  press; deployed HTTPS; PWA installable).
- AC7: after a transmission ends, a clip row appears in the channel log on both
  clients; playing it produces audio; a transcript string arrives when GROQ_API_KEY
  is configured (automated e2e for clip row presence; transcript verified manually
  or with key present).
- AC8: two browsers exchange chat messages in a channel in <1s perceived; creating
  a channel on one appears on the other; DM thread works between two identities;
  unread badge increments on the non-viewing client. (Automated.)
- AC9: direct PTT — client A goes direct to client B from the roster; B (on radio)
  hears audio; a third client on the team channel does NOT. (Automated.)
- AC10: OPS tab hidden when the aiEnabled flag is off, visible when on (automated
  flag flip via admin mutation); an AI question returns rendered blocks (live check
  with ANTHROPIC_API_KEY; automated smoke asserts the request/response cycle and
  block rendering with a canned block payload).
- AC11: push — subscription round-trip stores a pushSub row; a test send from the
  backend delivers a notification in a desktop browser context (automated where the
  harness allows; iPhone-installed-PWA verification is a documented manual step for
  Tony, like v1's AC6).
- AC12: Lighthouse mobile pass on all three tabs: no horizontal scroll from 320px
  width up; tap targets ≥44px; the radio screen's v1 layout unchanged.

## 8. Success Metric

Tony returns, opens the app on his phone: the radio works exactly as before; he
misses a transmission on purpose, gets the push, taps it, plays the clip and reads
the transcript; sends a DM and goes direct-PTT from it; asks OPS "who's been on
Security today and what did they say?" and gets a clean blocks answer — all without
anything feeling clunkier than the v1 radio.

## 9. v2.1 — Field-feedback amendment (2026-07-18)

From Tony's first field trial. Eight changes, one explicit skip. All v2
invariants hold unchanged; two are given sharper interpretations (see 9.3).

### 9.1 Problems observed

- **P1 — pocket death**: an iOS PWA can't capture or reliably receive with the
  screen locked. The wake lock exists but is invisible and uncontrollable; the
  real fix for deployments is native (recorded in NATIVE.md: PWA for demos,
  Capacitor + Apple PushToTalk for real deployments).
- **P2 — "Það er það."**: the STT hallucinated Icelandic on a ~1s clip — the
  classic short-burst Whisper failure. No language pin, no duration gate, no
  confidence signal.
- **P3 — OPS said "2 team channels" while the UI lists 5+**: the agent's only
  channel awareness silently drops quiet channels (convex/ai.ts:232 in v2);
  the UI lists every non-archived channel. Mismatches of this class kill trust
  in an ops agent.
- **P4 — "44 Alphas, all offline"**: e2e runs mint a permanent user row per
  browser context (the core suite reuses the literal names Alpha/Bravo), user
  rows are never cleaned, and nothing enforces call-sign uniqueness. Live dev
  data 2026-07-18: 45 users, 34 e2e debris.
- **P5 — transcripts are stored but not *memory***: "what did Alpha say about
  the west lot" is not answerable by OPS.

### 9.2 New capabilities (re-ranked Slack pulls + fixes)

1. **Unread + @mention badges with per-channel alert levels** (first).
   @mentions parse server-side, render highlighted, badge amber (mentions are
   "requires you", distinct from green unread), and bypass push suppression.
   Per user per channel: alert level `all | mentions | mute` set from the
   thread header. Mute silences push and the green badge; amber mention badges
   always surface.
2. **One-tap ACK on transmissions** — "COPY" is the radio-native reaction
   (deliberately not emoji). Any recipient taps COPY on a clip; the sender sees
   who copied, live. Idempotent, toggleable (mistap-safe).
3. **Transmission → checklist item** — a clip can become a task (label from
   its transcript, provenance kept), so the OPS checklist card starts doing
   work. Never from DM clips (private transcript must not leak to the shared
   checklist).
4. **STT hardening** — pin the transcription language (deployment-configurable,
   default `en`), skip transcription for clips under 1s (`too_short` — client
   still drops <400ms entirely, unchanged), derive a confidence flag from
   verbose segment data and mark low-confidence transcripts in the UI and to
   the agent.
5. **Transcripts as OPS memory** — a full-text search index over transcripts +
   a `search_transmissions` agent tool. "What did Alpha say about the west
   lot?" is now answerable. DM-visibility rules identical to v2's agent
   contract.
6. **One channel truth** — a single shared channel-enumeration helper feeds the
   chat list, the radio picker, unread totals, the dashboard, AND every agent
   context query + a new `list_channels` tool. Quiet channels no longer vanish
   from the agent's view; when the agent filters (archived, DMs), it must say
   so.
7. **Call-sign uniqueness + user hygiene** — a name held by a user active in
   the last 7 days cannot be claimed by another device (checked at the gate,
   enforced in `users.upsert`); the directory hides users inactive >30 days;
   e2e-created users are marked ephemeral and swept with their content; a
   one-off purge removes existing test debris.
8. **Keep screen awake, visibly** — the existing on-duty wake lock becomes a
   user-visible Settings toggle (default ON — today's behavior), with honest
   copy about the locked-screen limit. The native path is documented in
   NATIVE.md.

**Explicit skip — threads.** Radio traffic is linear; threads would fight the
metaphor. Recorded as a non-goal, not a deferral.

### 9.3 Invariant interpretations (no changes)

- **I5 (truthful roster)** now also covers the *directory*: the member list
  shows only users active within 30 days, and test identities never accumulate.
  (The radio roster was already self-cleaning.)
- **I7 (flags)**: alert levels are per-user prefs, not team flags — no new
  feature flag needed; OPS tooling additions ride the existing aiEnabled gate.

### 9.4 Acceptance criteria (additions)

- AC13 mentions: client B sends "@«A's name» …" in a team channel; A (not
  viewing) gets an amber mention badge on the CHAT tab and the channel row;
  opening the channel clears it. (Automated.)
- AC14 mute: A sets a channel to MUTE from the thread header; B posts there; A's
  tab LED does not light and unread total does not count it. (Automated.)
- AC15 ack: after a transmission, B taps COPY on the clip; the sender's device
  shows B's name on the clip's COPY line. (Automated.)
- AC16 transmission→task: B creates a task from a clip; the OPS checklist total
  increments. (Automated, admin/AI flag permitting.)
- AC17 call-sign: a second device attempting a name active within 7 days is
  rejected at the gate with a clear error. (Automated.)
- AC18 wake toggle: Settings shows KEEP SCREEN AWAKE, default on, persisted
  per device. (Automated presence/persistence; lock behavior manual on phone.)
- AC19 STT gate: a 0.4–1s clip records `too_short` and shows no transcript
  affordance; language is pinned; low-confidence transcripts carry a visible
  flag. (Gate automated where the harness allows; language/confidence verified
  manually with a real key.)
