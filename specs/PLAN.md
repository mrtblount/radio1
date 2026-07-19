# PLAN — Radio One Platform (Technical Architecture, v2)

> **Status**: v2 — Approved (autonomous session 2026-07-17; gates self-approved per
> owner direction, decisions + rationale recorded below). v1 plan sections that still
> govern the radio core (D1–D7, scale path) are retained verbatim at the bottom.

## 1. Stack (additions over v1)

| Layer | Choice | Rationale |
|---|---|---|
| Everything in v1 | unchanged | React 18 + Vite + TS + Tailwind v4, Convex, WebRTC mesh, Vercel, hand-rolled PWA |
| Client data layer | `ConvexReactClient` (one shared instance) + `convex/react` hooks for new surfaces | Chat/AI/unreads are list-shaped reactive UI — hooks are the productive idiom. The radio keeps its `RadioBackend` interface; `convexBackend.ts` now wraps the same shared client (one websocket, zero radio API changes). |
| Clip storage | Convex file storage | Already in the stack; upload-URL flow; served via `storage.getUrl` |
| Transcription | Groq `whisper-large-v3-turbo` via Convex `"use node"` action | Matches the owner's established convention ("Groq = transcription only"); graceful skip when key absent |
| AI agent | `@anthropic-ai/sdk` in a Convex `"use node"` action, `claude-opus-4-8` | "Anthropic = general AI" (same convention); tool-use loop over team data; forced final `respond` tool yields typed UI blocks |
| Push | Web Push (VAPID) via `web-push` in a Convex `"use node"` action; SW `push`/`notificationclick` handlers | Only web-platform path that reaches minimized/screen-off phones (installed PWA on iOS ≥16.4, any Chrome on Android) |
| Charts (ops blocks) | Hand-rolled SVG (bars/lines) | Keeps bundle tiny and the look 100% in-system; no charting dep |

**Reference-chat lessons (from discovery of the owner's sibling platform — why
ours will be fast where that chat is slow):**
That chat pays ~9 HTTP round trips per send, a per-channel query storm on every
list load (~35 queries for 10 channels), a remote auth call per request, and a
refetch-storm architecture (every broadcast makes every client refetch three
endpoints). None of that class of problem exists here: Convex reactive queries push
updated results over one websocket, auth is the access-code check inside the same
function call, unread counts are computed server-side in one indexed function, and
sends are a single mutation. That platform's own backlog says "consider Convex
migration for speed" — this app starts there.

## 2. System Architecture

```
┌──────────── Phone (installed PWA) ────────────┐
│  Shell: RADIO · CHAT · OPS tabs (+ Settings)  │
│   ├─ useRadio (always mounted; mesh survives  │
│   │   tab switches)                           │
│   ├─ TransmissionRecorder (sender-side,       │
│   │   records ONLY while floor held)  ──────────┐
│   ├─ chat hooks (useQuery/usePaginatedQuery)  │ │
│   ├─ ops thread + dashboard (reactive)        │ │
│   └─ sw.js ◄── Web Push ◄────────────────┐    │ │
└───────────────────────────────────────────│───┘ │
        WebRTC mesh (live audio, P2P only — │     │ clip upload after release
        unchanged, I3′)                     │     ▼
                                   ┌────────┴─────────────┐
                                   │ Convex               │
                                   │  control plane (v1)  │
                                   │  chat + reads        │
                                   │  transmissions + 📁  │──► Groq (transcribe)
                                   │  ai thread           │──► Anthropic (agent)
                                   │  push subs           │──► Web Push endpoints
                                   └──────────────────────┘
```

## 3. Identity & Access Model

- **`userId`**: stable random id minted once per device, stored in `localStorage`
  alongside the display name (v1 already persists the name). No accounts — identical
  spirit to v1. A `users` row (`{userId, name, lastActiveAt, prefs}`) is upserted at
  the identity gate and heartbeat while the app is open (30s + visibility events).
- **`sessionId`** stays exactly as v1: ephemeral, per radio join. Presence rows gain
  a `userId` field so chat surfaces can show "on radio".
- **Access code** (`ACCESS_CODE` env): unchanged, gates everything.
- **Admin code** (`ADMIN_CODE` env, new, optional): unlocks the admin panel
  (feature flags, channel archive, checklist template). Same pattern as access.ts.
  No `ADMIN_CODE` set → admin panel shows "not configured".

## 4. Data Model (Convex schema additions)

| Table | Shape (essentials) | Indexes |
|---|---|---|
| `users` | userId, name, lastActiveAt, prefs `{dashOpen?, notifyEnabled?}`, createdAt | by_userId |
| `channels` | key, name, kind `team\|dm`, postRestricted (announcements), archived, dmMembers? `[userIdA,userIdB]` (sorted), createdBy, createdAt | by_key, by_kind |
| `messages` | channelKey, userId, name, kind `text\|announce\|system\|clip`, body, clipId?, createdAt | by_channel `[channelKey, createdAt]` |
| `reads` | userId, channelKey, lastReadAt | by_user_channel |
| `typing` | channelKey, userId, name, until | by_channel |
| `transmissions` | channelKey, userId, name, sessionId, startedAt, durationMs, storageId, mimeType, transcript?, transcriptStatus `pending\|done\|failed\|skipped` | by_channel `[channelKey, startedAt]` |
| `pushSubs` | userId, endpoint, p256dh, auth, ua, createdAt | by_user, by_endpoint |
| `aiMessages` | userId, role `user\|assistant`, text, blocksJson?, status `thinking\|done\|error`, createdAt | by_user `[userId, createdAt]` |
| `tasks` | date `YYYY-MM-DD`, label, order, done, doneByName?, createdBy | by_date |
| `taskTemplate` | label, order, active | — |
| `settings` | singleton: aiEnabled, orgName? | — |

v1 tables (`members`, `floor`, `signals`) unchanged except `members.userId?` added.

**Seeding**: `channels.ensureSeeded` (idempotent mutation, called at gate): creates
`team` channels for the `CHANNELS` constant — **channel key = the exact v1 channel
name** ("Security", …) so radio floor/presence/signal keys and the v1 e2e are
untouched — plus an "Announcements" channel (postRestricted).

## 5. Key Design Decisions (v2)

### D8 — Direct 1:1 PTT = a DM channel (zero mesh changes)
`floor`, `members`, and `signals` are all keyed by arbitrary channel strings, so a
private radio channel needs no new machinery: going direct = leaving the current
radio channel and joining channel `dm_<a>_<b>` (canonical sorted pair, same row as
the chat DM). The mesh/floor code paths are literally the v1 ones. UI provides the
"DIRECT · «name»" framing and a one-tap return to the previous team channel.
One radio connection at a time (v1 semantics preserved).

### D9 — Record at the sender, upload after release (I3′)
On floor grant (right after `track.enabled = true`), start a `MediaRecorder` over a
stream containing the mic track. On release, **the mic is cut first exactly as v1**
(I2), then the recorder is stopped and the blob uploads in the background
(`generateUploadUrl` → POST → `transmissions.record`). Upload failure retries once
then drops silently — live PTT must never feel the recorder. Clips under ~400ms are
discarded (accidental taps). MIME: feature-detect `audio/mp4` (Safari) vs
`audio/webm;codecs=opus` (Chrome); stored per-clip. *(Verified in practice: Chromium records
`audio/mp4` via the ladder, so most clips are AAC-mp4, which everything plays;
webm/opus fallback covers older Chrome, and modern Safari plays it back.)*

### D10 — Clips fuse into chat history
`transmissions.record` also inserts a `kind:'clip'` message into the same channel's
chat timeline. One stream of team history per channel — text and voice interleaved;
unread badges and missed-transmission counts fall out of the existing reads model.
The radio tab's LOG sheet is just a filtered view of the same data.

### D11 — Transcription is async and optional
`record` schedules the Groq action; the clip row is usable immediately
(`transcriptStatus: pending → done/failed`), transcript text patches in reactively.
No `GROQ_API_KEY` → `skipped`, UI simply shows no transcript affordance.

### D12 — One websocket: `ConvexReactClient` shared by both worlds
`src/lib/convexClient.ts` exports the single client; `main.tsx` adds
`ConvexProvider`; `convexBackend.ts` adapts (`onUpdate` → `watchQuery().onUpdate`,
plus an initial-value fetch) behind the **unchanged** `RadioBackend` interface.
The v1 "only file importing Convex" rule is amended to: *radio core stays behind
`RadioBackend`; new platform surfaces use Convex hooks directly.* Rationale: the
Supabase-port seam matters for the radio (proven, intricate); for chat/AI the port
would be a data-layer rewrite regardless, and hooks buy the speed chat needs.
Recorded consciously as the price of the fusion.

### D13 — Push policy (don't spam)
- DMs, announcements: always push to recipients.
- Team-channel messages: push to team members **except** the sender and anyone
  active in-app within ~45s (`users.lastActiveAt`).
- Transmissions (clips): push only to members NOT in live radio presence on that
  channel (they already heard it live) — "Missed transmission from «name»".
- Every notification carries a `tag` (channel key) for coalescing and a deep-link
  URL (`/#/chat/<key>` or `/#/radio`); SW `notificationclick` focuses/opens.
  Badging API updates the icon count where supported.

### D14 — AI agent: tools + forced blocks, no token streaming (this pass)
`ai.ask` inserts the user message + a `thinking` assistant placeholder and schedules
the agent action. The action runs a bounded tool loop (≤6 rounds) with team-data
tools (`get_roster`, `get_transmissions`, `get_chat_activity`, `get_tasks`,
`add_task`, `complete_task`) and must finish via a `respond` tool whose schema is
the block union. The placeholder patches to `done` with blocks. The blinking status
lamp is the "working" affordance; token streaming is deferred (blocks-JSON streams
poorly; latency at sonnet scale is acceptable for ops Q&A). Flag-gated by
`settings.aiEnabled` (I7): OPS tab absent when off.

Adopted from the sibling platform's proven agent backend: (a) **status narration** — the action
patches the placeholder's text with a friendly per-tool label between rounds, so
the user watches "Checking the roster… → Reading transmissions…" reactively;
(b) **one model** — `claude-opus-4-8` with adaptive thinking and medium effort
(snappy ops answers; no cost-downgrading routing); (c) prompt caching skipped for now — the system
prompt is under the model's minimum cacheable prefix; (d) the system
prompt states date/timezone context and "answer exactly what was asked" style
rules. The agent's `text` block renders a hand-rolled markdown subset (bold,
lists); numeric/tabular data must go through stat/chart/checklist blocks — that's
the block system's job, and it keeps react-markdown out of the bundle.

### D15 — Block system (generative UI, Notion philosophy)
```ts
type Block =
  | { type: "text"; md: string }                      // paragraphs, bold, lists
  | { type: "stat"; label: string; value: string; sub?: string }
  | { type: "stats"; items: Stat[] }                  // the 3-up card row
  | { type: "chart"; kind: "bar" | "line"; title?: string;
      points: { label: string; value: number }[] }
  | { type: "checklist"; items: { id?: string; label: string; done: boolean }[] }
  | { type: "actions"; items: { label: string; action: ActionKind; arg?: string }[] }
  | { type: "link"; label: string; url: string };
```
Rendered by `BlockRenderer` with one component per type, all in issued-equipment
tokens. The dashboard strip reuses `stat` cards. This union is the foundation for
later user-designed dashboards.

### D16 — Shell preserves the v1 join screen as the identity gate
First run: the **v1 JoinScreen, visually unchanged** (name → channel → code → GO ON
DUTY) doubles as the identity gate — joining the radio also mints/upserts the user.
A quiet "open chat without radio →" link covers chat-first users (validates code,
skips mic). Returning users land directly in the shell; the radio tab shows the
channel picker. **The v1 e2e flow (same testids, same order) passes untouched.**
Tabs: bottom bar, silkscreen labels RADIO · CHAT · OPS, LED-dot unread badges,
safe-area padded. `useRadio` lives at the shell root; switching tabs never unmounts
the radio (I6) — mesh audio elements live on `document.body` regardless.

### D17 — Feature flags (I7)
`settings` singleton (default `aiEnabled: true` for the beta). `teamConfig` query
drives tab visibility reactively — flipping the flag updates every client live, no
redeploy. Guarded by admin code. Radio/chat flags reserved in the schema
(`settings` rows are extensible) but not surfaced this pass.

## 6. Backend Contract (new function inventory)

| Module | Functions |
|---|---|
| `users` | `upsert(userId,name,code?)` · `heartbeat(userId)` · `list()` · `me(userId)` · `setPrefs` |
| `channels` | `ensureSeeded` · `list(userId)` (team + my DMs + unread/last) · `create(name)` · `archive(key)` (admin) · `openDm(me,them)` |
| `messages` | `page(channelKey, paginationOpts)` · `send(channelKey,userId,body)` · `markRead` · `unreadSummary(userId)` · `setTyping` · `typers(channelKey)` |
| `transmissions` | `uploadUrl()` · `record(channelKey,…,storageId)` · `clipUrl(id)` · `forChannel(channelKey)` |
| `transcribe` | internal action `run(transmissionId)` (Groq) |
| `push` | `subscribe(userId, sub)` · `unsubscribe(endpoint)` · internal `send` action (web-push) + `notifyMessage` / `notifyClip` policies |
| `ai` | `thread(userId)` · `ask(userId, text)` · internal agent action + internal context queries |
| `tasks` | `today()` · `toggle(id, name)` · `add(label)` · `template` CRUD (admin) · cron `seedToday` |
| `settings` | `teamConfig()` · `setFlags(adminCode, flags)` |
| `access` | + `checkAdminCode` |

v1 modules (`presence`, `floor`, `signaling`, `maintenance`) unchanged
(presence.join gains optional `userId` arg).

## 7. Frontend Structure (new/changed)

```
src/
  lib/convexClient.ts            NEW — the one ConvexReactClient
  lib/radio/convexBackend.ts     CHANGED — wraps shared client; interface identical
  lib/radio/recorder.ts          NEW — TransmissionRecorder (start/stop → blob+mime)
  lib/platform/identity.ts       NEW — userId mint, name/prefs persistence
  lib/platform/notifications.ts  NEW — permission + push subscribe helpers
  lib/blocks/types.ts            NEW — Block union (D15)
  hooks/useRadio.ts              CHANGED — recorder wiring; direct-channel helpers
  hooks/useIdentity.ts           NEW
  hooks/useAppHeartbeat.ts       NEW — users.heartbeat while open
  App.tsx                        CHANGED — gate → shell(tabs)
  components/JoinScreen.tsx      CHANGED — identity gate duties; visuals untouched
  components/ChannelSelect.tsx   NEW — radio-tab channel picker (returning users)
  components/ChannelScreen.tsx   CHANGED — LOG button; roster tap → MemberSheet;
                                 DIRECT banner + return
  components/shell/TabBar.tsx    NEW
  components/shell/SettingsSheet.tsx  NEW — notifications toggle, install hint,
                                 admin unlock
  components/shell/AdminPanel.tsx     NEW — flags, archive, checklist template
  components/radio/TransmissionLog.tsx NEW — clips + transcripts sheet
  components/radio/ClipPlayer.tsx      NEW
  components/chat/ChatTab.tsx          NEW — list ⇄ thread (mobile single-pane)
  components/chat/ChannelList.tsx      NEW
  components/chat/ChatThread.tsx       NEW
  components/chat/MessageRow.tsx       NEW — text/announce/system/clip variants
  components/chat/Composer.tsx         NEW
  components/chat/NewChannelSheet.tsx  NEW
  components/chat/MemberSheet.tsx      NEW — online state, DM, GO DIRECT
  components/ops/OpsTab.tsx            NEW
  components/ops/DashStrip.tsx         NEW — 3 cards, collapsible (pref-persisted)
  components/ops/BlockRenderer.tsx     NEW — + per-block components
public/sw.js                     CHANGED — push, notificationclick, badge
e2e/platform.e2e.mjs             NEW — chat/clip/direct-PTT/flag journeys
```

## 8. Design Direction (v2) — one system, three surfaces

The **issued-equipment** language (chassis `#0b0d11`, panel, silkscreen caps,
LED lamps, amber TX `#ffb020`, green RX `#46e08a`, Saira Condensed + Barlow) is the
single governing system (SPEC I8). The radio screens do not change. Mapping for the
new surfaces:

- **Chat**: channel list rows = panel cards with silkscreen channel labels and LED
  unread dots; thread = quiet dark stream, sender name in silkscreen microtext,
  body in Barlow; announcements get an amber left rule; clips render as a compact
  player row (▶, duration ticks, expandable transcript in `--ink-dim`). Composer =
  panel input + amber SEND. No bubbles-vs-bubbles chat-app look — it's a log.
- **Ops thread**: single column, generous whitespace, the same chassis. Dashboard
  strip = three `stat` cards (panel, silkscreen label, big Saira value). Collapse
  chevron in the strip's header row. Status lamp top-right: green LED, `rx-blink`
  while the agent works (the reference ops thread's blinking-green motif, re-expressed
  with this system's LED grammar). Blocks render as panels; charts in RX green
  (real data only — green means data, matching both design cultures).
- **Tab bar**: chassis-colored plate, hairline top seam, three silkscreen labels,
  LED dot badges (green = unread, amber = active radio channel elsewhere).

**Reconciled against the reference-ops discovery** (the "standalone ops thread"
the owner remembers is a composite of a `/chat` single thread, a three-card "Daily
Overview" band, the green pulse motifs, and the schedule agent's ProposalCard —
all mapped in discovery). Concrete cues adopted, re-expressed in our tokens:
- Dashboard card anatomy (reference MetricCard): mono-caps eyebrow label → our
  `.silkscreen`; large tabular value → Saira Condensed bold; small delta/sub line
  in `--ink-dim`. Panel + hairline border, no shadows — both systems agree.
- The blinking indicator: a small round lamp with a ~2s opacity/scale pulse +
  a silkscreen label (a nav-status dot pattern) — ours is `.led
  .on-rx` + a new gentle `led-pulse` keyframe, top-right of the ops header,
  label "LINK". It blinks faster (`rx-blink`) while the agent is working.
- Agent working state: the reference agent streams friendly status labels per tool call
  ("Pulling daily sales…"). We adopt this: the agent action patches the
  placeholder message's text ("Checking the roster…", "Reading transmissions…")
  between tool rounds — reactivity delivers the narration without SSE.
- Green = real data only (both systems' law): chart/stat values are always real
  queries, never decoration.

## 9. Failure Modes & Handling (additions)

| Failure | Handling |
|---|---|
| Clip upload fails | 1 retry → drop; console warn; live PTT unaffected (D9) |
| Groq down / no key | transcriptStatus failed/skipped; clip still playable |
| Anthropic down / no key | assistant message → status error, friendly retry text; OPS stays usable |
| Push subscription revoked | send action prunes dead subs on 404/410 |
| Notification permission denied | Settings shows state + how to re-enable; app fully functional without |
| iOS not installed (no push possible) | Settings explains Home-Screen install first (detect `standalone`) |
| Flag flipped while OPS tab open | reactive `teamConfig` swaps tab away gracefully |
| Recorder unsupported mime | feature-detect ladder; if MediaRecorder absent → clips silently off, radio unaffected |

## 10. Perf Notes

Chat list + unread summary are single reactive server functions over indexed
queries (no N+1, no client joins, no refetch storms — the reference anti-patterns).
Message pages via `usePaginatedQuery` (50/page). Typing rows are tiny and swept.
Transmissions listed per channel with an index. The AI action is the only slow path
and it's explicitly asynchronous with a visible working state.

---

## Appendix: v1 decisions retained (D1–D7)

D1 pre-established mesh + track toggle (instant PTT) · D2 server-arbitrated floor
with expiry · D3 perfect negotiation · D4 signaling as consumable rows · D5
heartbeat presence · D6 iOS realities (gesture-gated audio, wake lock, visibility
reconcile) · D7 radio ergonomics (pointer events, spacebar, beeps, 60s cap) —
all unchanged; see git history for the full v1 text. Scale path (SFU swap ≥~12
concurrent) unchanged.
