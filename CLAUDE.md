# Radio One Platform

Mobile-first comms platform for volunteer/field teams (security, parking,
events, retail): push-to-talk radio + team chat + AI ops assistant in one PWA.
App: https://radio-one-sandy.vercel.app · landing page: https://radio1.app.
Can run standalone or gated behind an organization's existing app (see
INTEGRATION.md). Owner-specific integration notes live in `private/`
(gitignored — never commit that directory).

## Stack & commands

- React 18 + Vite + TS + Tailwind v4 (via `@tailwindcss/vite`), PWA.
- Convex backend (team `tony-blount`, project `team-radio`; dev
  `accurate-lobster-710`, prod `next-wolf-807`).
- `npm run dev` (app) · `npx convex dev` (backend) · `npm run build` (tsc + vite)
- `npm run e2e` — BOTH Playwright suites (core PTT + platform); needs dev
  server on :5173, `E2E_CODE=<access code>`, optionally `E2E_ADMIN_CODE` for
  the flag-flip check, or `E2E_URL=<deployed url>` to test prod.
- Deploy: `npx convex deploy -y && vercel --prod --yes`.
- Env vars (per deployment, via `npx convex env set`): `ACCESS_CODE` (team
  gate), `ADMIN_CODE` (admin panel), `GROQ_API_KEY` (transcripts),
  `ANTHROPIC_API_KEY` (ops agent), `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/
  `VAPID_SUBJECT` (push). Client env: `VITE_CONVEX_URL`,
  `VITE_VAPID_PUBLIC_KEY`. None of these ever go in the repo.

## Architecture invariants (from specs/SPEC.md — do not break)

- I1 half-duplex: one talker per channel, arbitrated ONLY by `convex/floor.ts`
  (direct 1:1 PTT is just a `dm_*` channel — same arbiter).
- I2 no hot mic: mic track `enabled=true` strictly while the floor is held;
  release cuts audio before ANY async work — including before the recorder
  stops (`stopTransmit` in useRadio).
- I3′ live path is P2P: live audio flows over the WebRTC mesh only. The
  SENDER's device records its own transmission while the floor is held and
  uploads the finished clip afterward (history/playback/transcripts). Upload
  failure must never block or degrade live PTT.
- I4/I5: floor holds and presence self-expire server-side (crons + heartbeats).
- I6 tabs never tear down the radio: `useRadio` is mounted at the App root;
  tab panes hide with `display:none`, never unmount.
- I7 feature flags gate features live (`settings.aiEnabled` → OPS tab), no
  redeploy.
- I8 one design system: issued-equipment tokens for every surface (silkscreen
  caps, LED lamps, amber TX, green RX; Saira Condensed + Barlow).

## Structure

- `convex/` — control plane + platform: presence/floor/signaling/sweeps (v1),
  users, channels, messages (chat), transmissions + transcribe (clips + Groq),
  push + pushSend (Web Push), ai + aiAgent (ops assistant), tasks, settings.
- `src/lib/radio/` — framework-free radio core behind the `RadioBackend`
  interface; `convexBackend.ts` wraps the shared `ConvexReactClient`
  (`src/lib/convexClient.ts` — ONE websocket for everything).
- `src/lib/radio/mesh.ts` — WebRTC full-mesh, perfect negotiation, pre-built
  connections with muted track (instant PTT). Intricate; test after touching.
- `src/lib/radio/recorder.ts` — sender-side clip capture (I3′). Best-effort:
  it may never throw into the PTT path.
- `src/hooks/useRadio.ts` — orchestrator; owns all press/release race handling.
- `src/lib/platform/` — identity (device userId, no accounts), clips upload,
  notifications (Web Push client), formatting. Chat/AI UI uses convex/react
  hooks directly (PLAN v2 D12 — the strict single-import seam applies to the
  radio core only).
- `src/components/` — shell (TabBar, SettingsSheet), chat/, ops/, radio/.
- `src/channels.ts` — seeded radio/chat channel names (still the only place
  the defaults are defined; DB `channels` table adds custom ones).
- Blocks (generative UI): `src/lib/blocks/types.ts` must stay in sync with the
  `respond` tool schema in `convex/aiAgent.ts`.

## Development Protocol

This project uses Spec-Driven Development. All new features and non-trivial
changes (3+ files, new data models, new APIs, new pages) MUST use the
/spec-driven-dev skill. Do not start implementing multi-file features without
running SDD first. Bug fixes and small changes (1-2 files) can proceed normally.

## House rules

- Branch + PR workflow; never merge to main without Tony's OK.
- After changing mesh/floor/signaling/useRadio/recorder: `npm run e2e` must
  pass before commit.
- Mobile-first: every new surface must hold at 320px wide with no horizontal
  scroll.
