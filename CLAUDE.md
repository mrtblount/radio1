# Team Radio

Push-to-talk (walkie-talkie) web app for volunteer/field teams (security,
parking, events). App: https://radio-one-sandy.vercel.app · landing page:
https://radio1.app. Can run standalone or gated behind an organization's
existing app (see INTEGRATION.md). Owner-specific integration notes live in
`private/` (gitignored — never commit that directory).

## Stack & commands

- React 18 + Vite + TS + Tailwind v4 (via `@tailwindcss/vite`), PWA.
- Convex backend (team `tony-blount`, project `team-radio`; dev
  `accurate-lobster-710`, prod `next-wolf-807`).
- `npm run dev` (app) · `npx convex dev` (backend) · `npm run build` (tsc + vite)
- `npm run e2e` — two-browser Playwright test; needs dev server on :5173, or
  `E2E_URL=<deployed url>` to test prod.
- Deploy: `npx convex deploy -y && vercel --prod --yes`.

## Architecture invariants (from specs/SPEC.md — do not break)

- I1 half-duplex: one talker per channel, arbitrated ONLY by `convex/floor.ts`.
- I2 no hot mic: mic track `enabled=true` strictly while the floor is held;
  release cuts audio before any async work (`stopTransmit` in useRadio).
- I3 live-only: audio flows P2P (WebRTC mesh); no audio data may ever reach
  Convex or any storage.
- I4/I5: floor holds and presence self-expire server-side (crons + heartbeats).

## Structure

- `convex/` — control plane: presence, floor, signaling, sweeps.
- `src/lib/radio/` — framework-free core; `convexBackend.ts` is the ONLY file
  importing Convex (swap point for Supabase — keep it that way).
- `src/lib/radio/mesh.ts` — WebRTC full-mesh, perfect negotiation, pre-built
  connections with muted track (instant PTT). Intricate; test after touching.
- `src/hooks/useRadio.ts` — orchestrator; owns all press/release race handling.
- UI: dark "issued equipment" direction (specs/PLAN.md §7) — silkscreen caps
  labels, LED lamps, amber TX. Fonts: Saira Condensed + Barlow (Fontsource).

## Development Protocol

This project uses Spec-Driven Development. All new features and non-trivial
changes (3+ files, new data models, new APIs, new pages) MUST use the
/spec-driven-dev skill. Do not start implementing multi-file features without
running SDD first. Bug fixes and small changes (1-2 files) can proceed normally.

## House rules

- Branch + PR workflow; never merge to main without Tony's OK.
- After changing mesh/floor/signaling: `npm run e2e` must pass before commit.
