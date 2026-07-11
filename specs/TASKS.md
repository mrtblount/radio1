# TASKS — Team Radio

> Execution order. Each task ≤3 files (Rule 6). Status updated as work proceeds.

| ID | Task | Files | Status |
|---|---|---|---|
| T01 | Scaffold Vite+React+TS+Tailwind app, git hygiene (.gitignore), README stub | package.json, vite.config.ts, index.html, src/main.tsx, … (scaffold exemption) | DONE |
| T02 | Provision Convex project (dev deployment), wire client env | convex.json, .env.local | DONE |
| T03 | Convex schema + presence functions | convex/schema.ts, convex/presence.ts | DONE |
| T04 | Convex floor control + maintenance crons | convex/floor.ts, convex/maintenance.ts, convex/crons.ts | DONE |
| T05 | Convex signaling functions | convex/signaling.ts | DONE |
| T06 | Frontend radio lib: types/interfaces, session identity, Convex backend adapter | src/lib/radio/types.ts, session.ts, convexBackend.ts | DONE |
| T07 | Squelch beeps (WebAudio) | src/lib/radio/beeps.ts | DONE |
| T08 | WebRTC mesh hook (perfect negotiation, track toggle, reconcile) | src/hooks/useWebRTCMesh.ts | DONE |
| T09 | useRadio orchestrator hook | src/hooks/useRadio.ts | DONE |
| T10 | Join screen UI | src/components/JoinScreen.tsx | DONE |
| T11 | Channel screen + roster UI | src/components/ChannelScreen.tsx | DONE |
| T12 | PTT button component (pointer + keyboard, all states) | src/components/PTTButton.tsx | DONE |
| T13 | App shell, wake lock, visibility reconcile | src/App.tsx, src/main.tsx | DONE |
| T14 | PWA: manifest, icons (Playwright-rendered), service worker | public/* | DONE |
| T15 | E2E verification: two-context PTT + floor contention + presence (AC1–AC3) | e2e via Playwright MCP | DONE |
| T16 | Deploy Convex prod + Vercel prod; verify deployed app (AC4) | — | DONE |
| T17 | Project docs: CLAUDE.md, llms.txt, README (phone test script), INTEGRATION.md | CLAUDE.md, llms.txt, README.md, INTEGRATION.md | DONE |
| T18 | GitHub repo, push branch, open PR | — | DONE |

Dependencies: T02→T03/T04/T05; T06 needs T03–T05 deployed to dev; T08/T09 need T06;
T10–T13 need T09; T15 needs T13; T16 needs T15 green.
