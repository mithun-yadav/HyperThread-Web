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
  behavior, and accessibility smoke checks. Authentication tests run against a
  deterministic local contract server rather than embedding production secrets.
- Browser visual QA: desktop and mobile screenshots compared against the
  accepted concepts.

Backend integration tests require the auth service on port 4000 and chat service
on port 4001 with PostgreSQL, Redis, and Kafka available. Tests must not print or
record credentials or tokens.

## Required states

API-facing tests cover loading, empty, success, unauthorized, validation error,
rate-limit, offline, and retry behavior. Realtime tests cover reconnect/rejoin,
deduplication, stale events, exact-idempotency retry, listener cleanup, and
direct-chat acknowledgement rules.
