# HyperThread Web

Production-focused Next.js frontend for the HyperThread realtime messaging
platform. The application uses a same-origin BFF for secure authentication,
TanStack Query for HTTP-backed state, and Socket.IO for realtime delivery.

## Included features

- Registration, login, session restoration, and logout with rotating tokens kept
  in HttpOnly, SameSite cookies (`Secure` in production)
- Protected chat routes and same-origin HTTP proxying with one guarded refresh
  path
- Direct and group conversation creation using the backend's UUID contract
- Cursor-paginated message history with stable scroll anchoring
- Socket-authoritative sending, optimistic state, exact-idempotency retry,
  reconnect/rejoin, typing indicators, and direct-message receipts
- Responsive desktop/mobile navigation with viewport-bound timelines and
  keyboard focus restoration
- Light, dark, and system themes, reduced-motion support, accessible status
  messaging, and coarse-pointer touch targets

## Requirements

- Node.js 24.15 or newer in the Node 24 line
- pnpm 11.25 or newer
- The companion HyperThread backend auth and chat services, cloned anywhere and
  reachable through the configured service URLs

## Local setup

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

The frontend runs on [http://localhost:5000](http://localhost:5000). Start the
backend auth service on port 4000 and chat service on port 4001. Their CORS
configuration must allow `http://localhost:5000`.

From the backend repository, a typical local startup is:

```bash
docker compose up -d
pnpm --filter auth-service start:dev
pnpm --filter chat-service start:dev
```

Run the two service commands in separate terminals after configuring and
migrating the backend as described in its README. The frontend `.env.local`
contains service URLs only; backend credentials and signing secrets remain in
the backend service environments.

## Commands

- `pnpm dev` — local development server on port 5000
- `pnpm typecheck` — strict TypeScript validation
- `pnpm lint` — ESLint checks
- `pnpm test` — unit and component tests
- `pnpm test:e2e` — Playwright browser tests
- `pnpm build` — production build
- `pnpm check` — full local quality gate

`pnpm test:e2e` starts a contract-faithful local auth/chat fixture and the
frontend automatically; the real backend is not required for this deterministic
suite.

See [backend integration](docs/backend-integration.md),
[architecture](docs/architecture.md), and [testing](docs/testing.md) for verified
contracts and project conventions.
