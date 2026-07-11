# Contributing to Team Radio / RADIO1

Thanks for your interest! This project is small on purpose — a push-to-talk
radio that volunteer teams can deploy in minutes. Contributions that keep it
simple are the most welcome kind.

## Run it locally

```bash
npm install
npx convex dev     # terminal 1 — provisions a free Convex backend on first run
npm run dev        # terminal 2 — app on http://localhost:5173
```

Open two browser windows, join the same channel, hold the key in one.

## Before you open a PR

1. `npm run build` passes (TypeScript + Vite).
2. `npm run e2e` passes (two-browser Playwright test; dev server must be
   running; pass `E2E_CODE=<code>` if your deployment sets ACCESS_CODE).
3. If you touched `mesh.ts`, `floor.ts`, or `signaling.ts`, say so in the PR —
   those carry the app's invariants (one talker per channel; the mic is only
   live while the key is held; audio never touches the server).

## Good first contributions

- A Supabase implementation of the `RadioBackend` interface (see INTEGRATION.md)
- Signed-token gate (INTEGRATION.md Path B) as a reusable module
- Translations of the UI strings
- An SFU (LiveKit) variant of `mesh.ts` for larger channels

## The landing page

`landing/` is a single static HTML file, deployed separately. Keep it
dependency-free.
