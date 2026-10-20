# HyperThread Web

Production-focused Next.js frontend for the HyperThread realtime messaging
platform. The application uses a same-origin BFF for secure authentication,
TanStack Query for HTTP-backed state, and Socket.IO for realtime delivery.

## Requirements

- Node.js 24.15 or newer in the Node 24 line
- pnpm 11.25 or newer
- HyperThread auth and chat services from `/home/mithun/Documents/HyperThread`

## Local setup

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

The frontend runs on [http://localhost:5000](http://localhost:5000). Start the
backend auth service on port 4000 and chat service on port 4001. Their CORS
configuration must allow `http://localhost:5000`.

## Commands

- `pnpm dev` — local development server on port 5000
- `pnpm typecheck` — strict TypeScript validation
- `pnpm lint` — ESLint checks
- `pnpm test` — unit and component tests
- `pnpm test:e2e` — Playwright browser tests
- `pnpm build` — production build
- `pnpm check` — full local quality gate

See [backend integration](docs/backend-integration.md),
[architecture](docs/architecture.md), and [testing](docs/testing.md) for verified
contracts and project conventions.
