# TASKS — Radio One Platform v2 (fusion build)

> Status: v2.1 — Phases A–G (fusion build) all DONE, merged 2026-07-17 (PR #1).
> Phase H decomposed 2026-07-18 from SPEC §9 + PLAN §11 (field-feedback batch,
> branch field-feedback-r1).
> Rule: after any task touching mesh/floor/signaling/useRadio, `npm run e2e` must pass.
> v1 TASKS (all 18 DONE) archived in git history.

## Phase H — Field-feedback batch (SPEC §9, PLAN D18–D24)

- [ ] H1. Schema delta (PLAN §11 table): users.ephemeral, messages.mentions,
  reads.alertLevel, transmissions acks/confidence/too_short/searchIndex,
  tasks.sourceTransmissionId. Push to dev.
- [ ] H2. User hygiene backend (D22): upsert NAME_HOLD enforcement +
  nameAvailable + list 30d filter; maintenance sweepEphemeralUsers (+ hourly
  cron) + purgeUsers; identity/useIdentity ephemeral pass-through.
- [ ] H3. Channel truth (D21): teamChannelRows/visibleChannelKeys helpers,
  converge the 6 consumers, ctxChatActivity keeps quiet channels,
  ctxTransmissions gains archived filter.
- [ ] H4. STT hardening (D19): transcribe language pin + verbose_json +
  confidence + stuck-pending fix; record <1s too_short gate;
  getForTranscription durationMs.
- [ ] H5. Agent memory + channel tools (D20/D21): ctxSearchTransmissions +
  ctxChannels internalQueries; search_transmissions + list_channels tools,
  narration, execTool cases, prompt rules; get_transmissions truncation.
- [ ] H6. Mentions + alert levels backend (D23): send parses mentions,
  setAlertLevel, unreadCount → {unread, mentionUnread}, channels.list rows,
  unreadSummary {total, mentions}, push recipient filters + mention tag.
- [ ] H7. Acks + task-from-clip backend (D24): transmissions.ack, clip/
  forChannel return acks+confidence, tasks.addFromTransmission (DM-reject,
  dedupe).
- [ ] H8. Wake-lock control (D18): useRadio pref gate + setKeepAwake,
  keepAwake storage helper, SettingsSheet card + honest hint. e2e must pass
  (touches useRadio).
- [ ] H9. Chat UI (D23): Composer @-autocomplete, MessageRow mention highlight,
  ChatThread header bell (ALL→@→MUTE), ChannelList amber @badges + muted
  styling, TabBar amber mention LED, App wiring.
- [ ] H10. Clip UI (D19/D24): ClipMessage second row — COPY + ack names +
  → TASK + LOW CONF tag; 320px check.
- [ ] H11. JoinScreen call-sign conflict UX (D22): nameAvailable pre-check on
  both radio and chat-only paths, error copy, keep testids.
- [ ] H12. e2e: both suites set team-radio:e2e + ptt suite run-suffixed names;
  new checks AC13–AC18 (mention badge, mute, ack, task, name conflict, wake
  toggle presence); keep AC1–AC10 green.
- [ ] H13. Verification: npm run build, both suites green, 320px viewport pass
  on changed surfaces, dev-data purge executed + verified, prod data inspected.
- [ ] H14. Adversarial review workflow over the full diff; fix confirmed
  findings; re-run gates.
- [ ] H15. Push branch, open PR with verification report (NO merge). Update
  CLAUDE.md env list (STT_LANGUAGE) + INTEGRATION.md cross-link if touched.

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
