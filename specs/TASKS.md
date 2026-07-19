# TASKS — Radio One Platform v2 (fusion build)

> Status: v2 — decomposed 2026-07-17 from SPEC v2 + PLAN v2. Executed in phases;
> tasks within a phase may parallelize where files don't overlap.
> Rule: after any task touching mesh/floor/signaling/useRadio, `npm run e2e` must pass.
> v1 TASKS (all 18 DONE) archived in git history.

## Phase A — Foundation (identity, shared client, shell)

- [ ] A1. `src/lib/convexClient.ts`: shared `ConvexReactClient`; `main.tsx` adds
  `ConvexProvider`. Adapt `convexBackend.ts` to wrap the shared client behind the
  unchanged `RadioBackend` interface (watchQuery adapter for subscriptions).
  Gate: `npm run e2e` passes (radio unaffected).
- [ ] A2. Schema v2: add `users, channels, messages, reads, typing, transmissions,
  pushSubs, aiMessages, tasks, taskTemplate, settings` tables + `members.userId?`
  (PLAN §4). Deploy to dev.
- [ ] A3. `convex/users.ts` (upsert/heartbeat/list/me/setPrefs) +
  `src/lib/platform/identity.ts` (userId mint/persist) + `useIdentity` +
  `useAppHeartbeat` hooks.
- [ ] A4. `convex/channels.ts`: ensureSeeded (team channels from CHANNELS const,
  key = exact v1 name + Announcements postRestricted), list w/ unread+last,
  create, archive, openDm.
- [ ] A5. Shell: `TabBar` (RADIO·CHAT·OPS silkscreen + LED badges), App.tsx
  gate→shell state machine, JoinScreen doubles as identity gate (visuals + testids
  untouched; adds users.upsert + "open chat →" path), `ChannelSelect` for
  returning users inside the radio tab. `useRadio` stays mounted at shell root
  (I6). Gate: e2e passes.

## Phase B — Chat core

- [ ] B1. `convex/messages.ts`: page (paginated), send (postRestricted + DM
  membership checks), markRead, unreadSummary, setTyping/typers.
- [ ] B2. Chat UI: `ChatTab` (list⇄thread single-pane), `ChannelList` (LED unread
  dots, DM section), `ChatThread` (usePaginatedQuery, scroll handling, mark-read),
  `MessageRow` (text/announce/system variants), `Composer` (typing beacon).
- [ ] B3. `NewChannelSheet` (create channel), `MemberSheet` (member list, online
  dots from users.lastActiveAt + radio presence, "MESSAGE" → openDm).
  Announcements: postRestricted enforcement + amber-rule styling.

## Phase C — Recording, playback, transcripts

- [ ] C1. `src/lib/radio/recorder.ts`: TransmissionRecorder (mime feature-detect
  mp4/webm-opus, start/stop→blob+duration). Wire into `useRadio`: start on grant
  (after track enable), stop in `stopTransmit` AFTER mic cut (I2), discard <400ms,
  background upload (uploadUrl→POST→record) with 1 retry. Gate: e2e passes.
- [ ] C2. `convex/transmissions.ts`: uploadUrl, record (inserts row + kind:'clip'
  message + schedules transcribe + schedules missed-push), clipUrl, forChannel.
- [ ] C3. `convex/transcribe.ts` ("use node"): Groq whisper-large-v3-turbo action,
  patches transcript/transcriptStatus; skipped when no key. Set GROQ_API_KEY on dev.
- [ ] C4. Playback UI: `ClipPlayer` (▶/⏸, duration, progress), clip variant in
  `MessageRow` w/ expandable transcript, `TransmissionLog` sheet in ChannelScreen
  (LOG button). e2e: clip row appears after a transmission (AC7 automated part).

## Phase D — Direct PTT

- [ ] D1. ChannelScreen: roster member tap → MemberSheet (shared w/ chat) with
  "GO DIRECT" — switches radio connection to the dm channel (leave+join, v1 code
  paths), DIRECT banner + one-tap return to previous channel. From chat DM header:
  "GO DIRECT" same flow + auto-switch to RADIO tab.
- [ ] D2. e2e: direct PTT journey (A↔B direct, C on team channel hears nothing —
  AC9).

## Phase E — Push notifications

- [ ] E1. VAPID keys generated + set on dev (+prod at deploy): VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY, VAPID_SUBJECT; VITE_VAPID_PUBLIC_KEY client-side.
- [ ] E2. `convex/push.ts` (subscribe/unsubscribe/subsForUsers) +
  `convex/pushSend.ts` ("use node", web-push): send + prune dead subs; policies
  notifyMessage (DM/announce always; team minus active) + notifyClip (members not
  in live radio presence) per PLAN D13.
- [ ] E3. `public/sw.js`: push → showNotification (tag=channelKey, deep-link data),
  notificationclick → focus/open URL; `src/lib/platform/notifications.ts` +
  Settings toggle (permission flow, iOS install hint via display-mode detect);
  Badging API on unread change.

## Phase F — AI ops thread (flagged)

- [ ] F1. `convex/settings.ts` (teamConfig, setFlags admin-guarded) + access.ts
  checkAdminCode + `AdminPanel` (flags, archive channels, checklist template) +
  `SettingsSheet` (notifications, admin unlock, off-duty).
- [ ] F2. `convex/tasks.ts`: template CRUD, today list, toggle/add, cron seedToday
  (5am ET). Dashboard data feeds.
- [ ] F3. `convex/ai.ts` (thread, ask, internal context queries) + `convex/aiAgent.ts`
  ("use node"): Anthropic tool loop ≤6 rounds, tools per PLAN D14, forced `respond`
  block-union output, status narration patches, model routing + prompt caching.
  Set ANTHROPIC_API_KEY on dev.
- [ ] F4. `src/lib/blocks/types.ts` + `BlockRenderer` (+ per-block components:
  text/stat/stats/chart(SVG)/checklist/actions/link) in issued-equipment tokens.
- [ ] F5. `OpsTab`: thread (aiMessages reactive), composer, LINK lamp (led-pulse
  idle / rx-blink working), `DashStrip` 3 cards (On Duty · Missed · Checklist)
  collapsible w/ pref persistence. Tab hidden when !aiEnabled (I7).

## Phase G — Verification & ship

- [ ] G1. `e2e/platform.e2e.mjs`: chat send/receive + unread badge (AC8), clip row
  (AC7), direct PTT isolation (AC9), flag flip hides OPS (AC10 automated part).
  `npm run e2e` runs both suites.
- [ ] G2. Full build + typecheck + both e2e suites green locally.
- [ ] G3. Mobile-viewport Playwright walkthrough of all three tabs (320px–430px),
  screenshots, no horizontal scroll (AC12); verification report in PR.
- [ ] G4. Deploy dev convex env vars; push branch; open PR (NO merge). Document
  phone-verification script for Tony (push on installed PWA, playback on iPhone).
