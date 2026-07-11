# Team Radio — push-to-talk for the team

A walkie-talkie in the browser. Open the link, join a channel, **hold the key,
talk** — everyone on the channel hears you live. Built for volunteer and field
teams — security, parking, events, ushering — that need instant coordination
without accounts, app stores, or per-seat pricing. Designed to run standalone
or be gated behind your organization's existing app
(see [INTEGRATION.md](INTEGRATION.md)).

**Website: https://radio1.app** — deploy your own radio in about 10 minutes
(see [Develop](#develop) below; free tiers of Convex + Vercel cover a team).

## Test it on your phones (2 minutes)

1. Open **your deployment's URL** on the iPhone (Safari) and the
   Android (Chrome). Any two devices work — or a laptop + a phone.
2. On each: enter a different name, the access code, tap **CH1 Security**,
   tap **GO ON DUTY**. (Each device only asks for the code once.)
3. **Allow microphone** when the browser asks.
4. Wait a few seconds — the other person's name appears under ON DUTY with a
   green lamp when the audio link is up ("linking…" clears).
5. **Hold the big TALK key** on one phone, speak, release. The other phone
   plays it live. Try both directions; try pressing both at once (second
   presser gets CHANNEL BUSY).
6. Optional: install it — Safari: Share → **Add to Home Screen**. Chrome:
   menu → **Add to Home screen**. It opens full-screen like an app.

> Tip: if the two phones are next to each other you'll get feedback squeal,
> like real radios. Test from different rooms.

## What's inside

| Piece | Tech |
|---|---|
| App | React 18 + Vite + TypeScript + Tailwind, PWA |
| Live audio | WebRTC full-mesh, connections pre-built at join; PTT toggles the mic track → near-instant keying |
| Control plane | Convex — presence heartbeats, server-arbitrated floor control (one talker per channel), WebRTC signaling relay |
| Half-duplex | `floor` table + transactional acquire; expires in 10s without renewal, 60s max transmission |
| NAT traversal | Google/Cloudflare STUN + OpenRelay TURN fallback |
| Hosting | Vercel (static) + Convex Cloud (prod: `next-wolf-807`) |

Audio never touches the server — it flows peer-to-peer and is never recorded.

## Access code (the no-accounts gate)

One shared code protects the whole radio; every backend function rejects calls
without it (not just the UI). It's controlled by a single env var — no code
changes, no redeploy of the app:

```bash
npx convex env set ACCESS_CODE <your-code> --prod   # set / change it
npx convex env remove ACCESS_CODE --prod            # turn the gate off entirely
```

(Running `npm run e2e` against a gated deployment: pass the code as
`E2E_CODE=<your-code>`.)

When unset, the code field disappears and anyone with the URL can join.
Team members enter the code once per device; it's remembered after that.

## Channels

Channel names live in **one place**: [`src/channels.ts`](src/channels.ts).
Add, rename, or remove entries in that array (no practical limit — a channel
exists by being named), then redeploy with `vercel --prod --yes`. Each channel
independently supports ~12 concurrent members on the mesh.

## Known limits (web platform, by design for the MVP)

- **The screen must stay on.** iOS/Android suspend browser audio when the
  phone locks or the app backgrounds. The app requests a screen wake lock
  while you're on duty. Locked-screen PTT requires a native app (later step).
- The mic indicator stays on while you're in a channel (the mic is held muted
  for instant keying — nothing transmits until you hold TALK).
- Mesh audio is sized for a team channel (~12 concurrent members). Path to an
  SFU is documented in INTEGRATION.md.

## Develop

```bash
npm install
npx convex dev        # terminal 1 — backend (team: tony-blount, project: team-radio)
npm run dev           # terminal 2 — app on http://localhost:5173
npm run e2e           # two-browser PTT test (dev server must be running)
```

Deploy: `npx convex deploy -y` then `vercel --prod --yes`
(env `VITE_CONVEX_URL` is set to the prod Convex URL in Vercel).

Specs live in [specs/](specs/) — SPEC (product), PLAN (architecture), TASKS.

## License

[MIT](LICENSE) — free to use, copy, and adapt for any team or organization.
