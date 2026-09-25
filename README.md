# FRNTDesk

Host and attend paid, live classroom-style video tutorials. Zambian mobile money
(MTN MoMo, Airtel Money) for payment; LiveKit for the live room.

## Stack

| Layer | Choice |
| --- | --- |
| Web | Angular 22.1.7 — standalone components, signals, zoneless |
| API | NestJS 12.0.3 |
| Data | PostgreSQL 18 + Prisma 7.10.0 |
| Queue | BullMQ 6 on Redis 7 |
| Media | LiveKit Cloud (SFU) — `livekit-client` 2.22 |
| Auth | Auth0 Universal Login — `@auth0/auth0-angular` 2.12, `express-oauth2-jwt-bearer` 1.10 |
| Shared | `@frntdesk/shared` — zod schemas + pure domain logic used by both apps |

## Pinned versions — do not let these drift

Three pins are load-bearing. CI fails the build if any of them moves.

| Package | Pin | Why |
| --- | --- | --- |
| `typescript` | `6.0.3` | `@angular/compiler-cli@22` peer-requires `>=6.0 <6.1`. npm's `latest` is 7.x and **breaks the Angular build**. |
| `vitest` | `4.1.11` | `@angular/build@22` peer-requires `^4.0.8`. npm's `latest` is 5.x. |
| `prisma` / `@prisma/client` | `7.10.0` | The `prisma` `latest` dist-tag points at an **8.0 release candidate**. 7.10.0 is the newest stable. |

A root `overrides` block forces transitive `vitest` specs down to our pin —
without it, `@vitejs/devtools-vitest` pulls `vitest@*` and npm's dependency
resolver crashes outright.

## Getting started

```bash
cp .env.example .env
# Fill in AUTH0_DOMAIN / AUTH0_CLIENT_ID / AUTH0_AUDIENCE — see "Auth0 setup" below.
npm install
npm run infra:up            # postgres:5433, redis:6380, mailpit:8025
npm run db:migrate --workspace @frntdesk/api
npm run db:seed
npm run dev                 # API on :3000, web on :4200
```

`npm run dev` (and `build`/`test`) regenerates `apps/web/src/environment.ts`
from `.env` automatically via an npm `pre*` hook — see `apps/web/scripts/generate-environment.cjs`.
It's gitignored like `.env` itself; run `npm run generate-environment --workspace @frntdesk/web`
directly if you ever need it without running one of those.

Seeded users (`host@frntdesk.local`, `student@frntdesk.local`) have **no
password** — identity is entirely Auth0's job. Sign up in Universal Login with
one of those emails and the seeded row (with its demo classrooms) is claimed
automatically; see "How login actually works" below.

Check the API is up: `curl localhost:3000/api/health/ready`

## Auth0 setup

Identity is fully delegated to Auth0 — there is no local login/password/
refresh-token system. You need a tenant and two things registered in it
(five minutes, one time):

1. **Applications → Create Application → Single Page Application.** This is a
   *public* client (Authorization Code + PKCE, no client secret) — that's
   what makes its Domain/Client ID safe to bake into the frontend build.
   - Under its **Settings**, set:
     - **Allowed Callback URLs**: `http://localhost:4200`
     - **Allowed Logout URLs**: `http://localhost:4200`
     - **Allowed Web Origins**: `http://localhost:4200`
   - Copy the **Domain** and **Client ID** from this page.
2. **Applications → APIs → Create API.** This represents the NestJS backend.
   - **Identifier**: any unique URI-shaped string, e.g. `https://api.frntdesk.zm`
     (it doesn't need to resolve to anything real — it's just an audience tag).
   - Signing Algorithm: RS256 (the default).
   - Copy the **Identifier** — that's your `AUTH0_AUDIENCE`.
3. Paste the three values into `.env`:
   ```
   AUTH0_DOMAIN=your-tenant.us.auth0.com
   AUTH0_CLIENT_ID=<Client ID from step 1>
   AUTH0_AUDIENCE=<API Identifier from step 2>
   ```
4. *(Optional, any time later)* **Authentication → Social** to enable Google
   and/or Facebook connections. This needs zero code changes on our side —
   Universal Login shows whatever connections are enabled on the tenant.
   Auth0's shared "dev keys" work for local testing without your own
   Google/Facebook OAuth app, with rate limits fine for development.

### How login actually works

There's no login form in this app — tapping "Log in" redirects to Auth0's own
hosted Universal Login page, then back. Nothing here ever sees a password.

- **Frontend** (`apps/web/src/app/core/auth/`): `AuthStore` wraps Auth0's own
  `AuthService`, exposing the same signal surface (`isAuthenticated`,
  `currentUser`) the rest of the app already used with the old system, so
  guards and the shell didn't need to change. `authGuard`/
  `redirectIfAuthenticatedGuard` wait for Auth0's one-time startup check
  (`ready()`) before deciding — deciding synchronously would bounce a
  genuinely logged-in user to `/login` on every hard refresh.
- **Backend** (`apps/api/src/auth/`): `Auth0Guard` validates the incoming
  access token's signature via Auth0's JWKS (using their own
  `express-oauth2-jwt-bearer` middleware, not a hand-rolled verifier). The
  token only proves `sub` (the Auth0 user id) — profile fields (email, name)
  are trusted from the authenticated request body instead, which is why
  `POST /api/auth/sync` exists: called once after every login, it
  just-in-time-provisions a local `User` row (or links an existing one by
  email, e.g. a seeded demo row — see `AuthService.syncUser`) so the rest of
  the schema still has an internal UUID to hang foreign keys off, since
  Auth0's own user id (`auth0|...`, `google-oauth2|...`) is never used as one.

## What's built

| Area | API | Web |
| --- | --- | --- |
| Identity | `auth/` — Auth0 JIT provisioning, account linking | Login redirect, account page |
| Catalog | `classrooms/` — catalog, detail, sessions, enrollment | `/classes`, class detail, My Classes |
| Hosting | `classrooms/` host routes — CRUD, publish, schedule, roster | `/host/classrooms` + manage tabs |
| Organisations | `organisations/` — businesses/schools and their sub-courses | `/organisations` |
| Payments | `payments/` — checkout, guarded state machine, BullMQ reconciliation | Checkout with live polling |
| Invitations | `invitations/` — tokenized invites, email, redemption | Invite composer, invite landing |
| Live | `live/` — LiveKit tokens, promote, webhook | Live room: screen share + camera, chat, hand-raise |
| Replays | `recordings/` — library, entitlement, pricing | Library, replay player |

**Live video runs locally.** `npm run infra:up` starts a LiveKit server in dev
mode alongside Postgres and Redis, so screen sharing and camera work with no
cloud account and no keys to buy. Production points `LIVEKIT_URL` at LiveKit
Cloud instead and fills in real credentials; nothing in the app knows the
difference. If the three `LIVEKIT_*` values are missing, every live endpoint
returns 503 naming them rather than failing somewhere inside the SDK.

**Replay capture** (LiveKit egress → S3) is gated behind `RECORDING_ENABLED`
and is deliberately not wired up: with no bucket configured there is nothing to
write to, and an egress that dies mid-session is worse than one that never
started. The read side (library, entitlement, pricing) is complete, so
recordings play as soon as rows exist.

Payments run end to end locally on `PROVIDER_FAKE_ENABLED=true`: the fake
provider goes PENDING first and only settles on a later status poll, so the
reconciliation path is exercised in development rather than only in production.
A number ending in `0` always declines, which gives the failure path a
deterministic trigger.

## Verification

```bash
npm run typecheck           # all workspaces
npm test                    # all workspaces
npm run build
```

## Things worth knowing

**Ports are shifted.** Postgres is on `5433` and Redis on `6380` so the compose
stack does not collide with locally installed instances.

**The MoMo sandbox only accepts EUR.** The database always records ZMW;
`MTN_WIRE_CURRENCY` controls what goes on the wire. It must be `ZMW` in
production, and the env schema refuses to boot a production build that sets
anything else.

**Airtel has no self-service sandbox.** Credentials require full business
verification, so `PROVIDER_AIRTEL_ENABLED` stays `false` until onboarding
completes. The fake provider (`PROVIDER_FAKE_ENABLED`) carries local
development and e2e tests; the env schema refuses to enable it in production.

**A payment callback is never trusted.** MTN's callback is unauthenticated, so
the handler only records the event and enqueues a reconciliation job —
authority to settle a payment comes solely from polling the provider's own
status endpoint. See `apps/api/src/payments/`.

**Postgres 18 changed its Docker volume layout.** The mount belongs at
`/var/lib/postgresql`, not `/var/lib/postgresql/data`; the old path makes the
container refuse to start.

**No cookies, no server-issued JWTs.** Auth0's SDK holds its own session
client-side (refresh tokens, `useRefreshTokens: true` + `cacheLocation:
'localstorage'`) and attaches access tokens via an `Authorization` header
through its own HTTP interceptor. The API's CORS config no longer needs
`credentials: true`, and there's nothing for `cookie-parser` to read anymore
— both were removed rather than left as dead configuration.

**`syncUser`'s account-linking only ever attaches an identity to a row whose
`auth0Sub` is still null.** A row that's already linked to a different Auth0
identity throws a `ConflictException` instead of silently being reassigned —
this is the one piece of the Auth0 integration with real security weight
(getting it backwards would be an account-takeover bug), and it has direct
unit test coverage (`apps/api/src/auth/auth.service.test.ts`) rather than
resting on code review alone.

**Screen sharing is the host's alone, and the token is what enforces it.** The
join token grants `canPublishSources` — camera, microphone, screen share and
screen-share audio for the host; camera and microphone only for a student who
has been promoted to speak. LiveKit rejects a publish outside that list server
side (`insufficient permissions`), so hiding the button is a courtesy, not the
control. A teacher demonstrating an application publishes two video tracks at
once; the live room separates them by `Track.Source`, never by arrival order,
and puts the screen on the main stage with the camera as a click-to-swap inset.

**`/live/:sessionId` must stay first in the route tree.** `AppShell` sits at
`path: ''` with a `**` child, and a prefix match on `''` means the router
descends into those children for *every* URL — where the wildcard claims the
live route and renders "page not found". The live room is only reachable
because its route is declared above the shell.

**There is no forgot-password, reset-password or verify-email route.** Those
existed before the Auth0 migration and were removed rather than reimplemented:
Universal Login owns the whole credential lifecycle, password changes go
through `AuthStore.requestPasswordChange` on the account page, and verification
is Auth0's own email. Adding them back would mean rebuilding a system this app
deliberately does not have.

**A public-to-read endpoint needs its own `allowAnonymous` entry.** Auth0's
HTTP interceptor (`apps/web/src/app/app.config.ts`) matches the *first* entry
in `allowedList`, and the default behavior for a match is to demand a token —
so a signed-out visitor hitting `/api/classrooms` gets a `login_required` error
thrown before the request ever reaches the network. Public routes therefore sit
above the `/api/*` catch-all with `allowAnonymous: true`. It still attaches a
token when there is a session, which is why enrolling from a public catalog
page works.

**`npm audit` reports 4 high findings.** All are in the Prisma **CLI's**
transitive tree (`mysql2`, `deepmerge-ts`) — a devDependency that is never
shipped, and `mysql2` is never loaded because we run Postgres. npm's suggested
remedy is a downgrade to Prisma 6, which is worse than the finding.

## Layout

```
apps/api        NestJS API, Prisma schema and migrations
apps/web        Angular application
packages/shared zod schemas, money handling, MSISDN routing, payment state machine
```

`packages/shared` is the single definition of every request and response shape.
The API validates against it; the web app infers its types from it. Build it
before anything that depends on it.



DB = SUPABASE
Video CDN = Bunny.net
Video streaming  & WEBRTC- LIVEKIT
