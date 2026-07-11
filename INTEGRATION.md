# Integrating Team Radio into your organization's app

Team Radio runs great standalone (URL + shared access code), but most teams
eventually want it behind their organization's existing app and permissions.
Three proven paths, in order of effort.

## Path A — link out, gate with the shared access code (zero code)

Put a "Radio" link in your app pointing at your deployment. The `ACCESS_CODE`
env var (see README) keeps strangers out. Simplest possible setup; permissions
are all-or-nothing.

## Path B — keep it standalone, gate through your app's login (recommended)

The radio stays a separate app; yours becomes the only door into it. Users
never see a login on the radio itself:

1. **Your app's side**: show a "Radio" button only to authorized members.
   Tapping it calls a tiny endpoint (~30 lines — e.g. a Supabase Edge Function
   or any serverless function) that mints a **short-lived signed token** — a
   JWT containing `name`, `allowedChannels` (derived from the user's roles),
   and a ~60-second expiry — signed with a secret shared with the radio's
   Convex deployment. Then open `https://your-radio.example/#t=<token>`.
2. **Radio side**: on load, if `#t=` is present, verify signature + expiry in
   a Convex function, skip the join screen — the name comes from the token and
   the channel list shown is `allowedChannels`. A parking crew member sees only
   their channel; a supervisor sees several and toggles between them.
3. Make the permission real, not cosmetic: `presence.join` and `floor.acquire`
   must verify the requested channel is in the token's `allowedChannels`.

Roughly a day of work across both apps; nothing about the mesh, floor control,
or UI changes.

## Path C — embed the feature inside your app

The frontend is plain React + Vite + Tailwind, so it drops into any app on
that stack:

1. `npm i convex` in your app.
2. Copy `src/lib/radio/` (all files), `src/hooks/useRadio.ts`, and the
   components you want (`PTTButton.tsx`, `ChannelScreen.tsx` — restyle freely;
   all radio logic lives in the hook, not the components).
3. Copy `convex/` into your repo; `npx convex dev` once to provision, then
   `npx convex deploy`. Set `VITE_CONVEX_URL`.
4. Replace the join screen with your own auth: your app already knows the
   user's name — call `join(user.displayName, channel)` directly, and map
   your groups/roles to channels (a channel is just a string).

### Porting the backend to Supabase (optional)

Everything backend-facing sits behind one interface: `RadioBackend` in
`src/lib/radio/types.ts`, implemented only by `convexBackend.ts`. Implement a
`supabaseBackend.ts` against the same interface and nothing else changes:

| RadioBackend method | Supabase implementation |
|---|---|
| `join/leave` + `subscribeRoster` | Realtime **Presence** on channel `radio:<channel>` (replaces the members table + heartbeats + sweeps entirely) |
| `acquireFloor/renewFloor/releaseFloor` | Postgres `floor` table + 3 `SECURITY DEFINER` RPCs (atomicity via unique constraint on `channel`) |
| `subscribeFloor` | Postgres Changes subscription on the `floor` table |
| `sendSignal` + `subscribeInbox` | Realtime **Broadcast** on channel `signal:<sessionId>` (ephemeral — no table, no consume step) |

The floor-expiry sweep becomes a `pg_cron` job (or lives inside the acquire
RPC, which the Convex version already demonstrates).

## Hardening for real use

- **TURN credentials**: the free OpenRelay static relay is fine for testing.
  For production, create a free https://www.metered.ca account (20GB/mo relay)
  and put its iceServers array in `src/lib/radio/mesh.ts` — a 5-minute change.
- **Scale past ~12 concurrent per channel**: swap the mesh for an SFU. LiveKit
  Cloud's free tier + React SDK replaces `mesh.ts`; floor control, presence,
  and all UI are untouched. Roughly a day of work.
- **PTT with the phone locked**: not possible on the web platform. Options, in
  order of effort: (1) accept screen-on use, (2) wrap in Capacitor for app
  stores + native audio session (~days, reuses this code), (3) a native
  Zello-style client (~weeks). Decide only if your team actually hits the limit.
