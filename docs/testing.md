# Testing and verification

## Local quality gate

Run `pnpm check` before merging. It verifies formatting, lint, strict types,
Vitest, and the production Next.js build.

## Test layers

- Vitest: pure contract transforms, state reducers, API helpers, and components.
- Testing Library: keyboard, form validation, accessible labels, and user-visible
  state transitions.
- Playwright: public authentication routes, protected routing, secure cookie
  behavior, refresh coalescing, logout, responsive chat navigation, composer
  behavior, long-timeline containment, realtime reconnect/retry, account cache
  isolation, theme persistence, and light/dark accessibility checks.
- The Playwright fixture exposes contract-faithful auth, chat HTTP, and Socket.IO
  behavior on ports 4100 and 4101. It exercises the real frontend BFF and browser
  socket client without embedding production secrets or depending on shared
  infrastructure.
- Browser visual QA: desktop and mobile screenshots compared against the
  accepted concepts.

Backend integration tests require the auth service on port 4000 and chat service
on port 4001 with PostgreSQL, Redis, and Kafka available. Tests must not print or
record credentials or tokens.

## Verified baseline

The final local verification on 2026-10-20 passed:

- formatting, ESLint, strict TypeScript, and the Next.js production build;
- 15 Vitest files with 44 passing tests;
- 24 Playwright checks across desktop Chrome and mobile emulation;
- zero serious or critical axe violations in the tested login and chat states in
  both light and dark themes.

Firefox and WebKit are not configured in this repository. The Playwright suite
is deterministic contract coverage, not a substitute for a deployed smoke test.

## Real-backend smoke status

Local PostgreSQL, Redis, and Kafka were healthy and the real auth service started
successfully. The real chat service did not start because its existing NestJS
`ChatGateway` dependency at constructor index 6 resolves to `undefined`. The
frontend repository and backend source were not changed to conceal or bypass
that failure. Consequently, full browser-to-production-service smoke coverage
remains pending until the backend startup defect is fixed; the verified frontend
contract and fixture coverage above remain green.

## Required states

Automated tests collectively cover loading, empty, success, unauthorized,
validation error, rate-limit, offline, and retry behavior. Realtime tests cover
reconnect/rejoin, deduplication, stale events, exact-idempotency retry, listener
cleanup, and direct-chat acknowledgement rules.
