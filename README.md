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
# Generate the two JWT secrets:
#   openssl rand -base64 48
npm install
npm run infra:up            # postgres:5433, redis:6380, mailpit:8025
npm run db:migrate --workspace @frntdesk/api
npm run db:seed
npm run dev                 # API on :3000, web on :4200
```

Seeded accounts (development only), both with password `frntdesk-dev-password`:

- `host@frntdesk.local` — owns two published classrooms
- `student@frntdesk.local`

Check the API is up: `curl localhost:3000/api/health/ready`

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
