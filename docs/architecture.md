# Frontend architecture

## Decision summary

HyperThread Web is a Next.js App Router application with strict TypeScript,
Tailwind CSS, TanStack Query, Socket.IO Client, and focused accessible
components. The browser talks to same-origin Next route handlers for HTTP. Those
handlers proxy the two backend services and own authentication cookies.

This BFF boundary is required because the backend returns access and refresh
tokens in JSON and offers no cookie flow. The frontend stores both tokens in
HttpOnly, SameSite cookies that also use the `Secure` flag in production. A
same-origin socket-token route returns only the current short-lived access token
to authenticated JavaScript memory so Socket.IO can complete its required
handshake. Refresh tokens are never exposed to client code or persisted in
browser storage.

The frontend repository began as an empty, unborn `main` branch with no package
manager, framework, tests, dependencies, or reusable source files. The project
therefore adopts pnpm to match the backend workspace and runs locally on port
`5000` to match the backend CORS examples.

## Routes

```text
app/
  (auth)/login
  (auth)/register
  chat
  session/restore
  api/auth/{login,register,logout,session,socket-token}
  api/auth/session/refresh
  api/chat/[...path]
```

The auth pages are public. Next Proxy verifies the access token with the auth
service before rendering chat and forwards a request-only verification header to
the protected layout. When refresh is required, Proxy redirects to a small
restoration page; it never rotates tokens itself. That page calls the one
dedicated refresh route before returning to chat. Invalid sessions are cleared
and redirected to login; an auth-service outage returns a non-cacheable `503`
rather than weakening the check. Logout clears frontend cookies and disconnects
the socket; it cannot revoke the backend session because no endpoint exists.

## Module boundaries

```text
src/
  components/ui/        reusable controls and feedback
  features/auth/        forms, validation, and session restoration
  features/chat/        contracts, HTTP state, shell, timeline, dialogs
  features/chat/realtime/
                        controlled Socket.IO client and cache reconciliation
  lib/api/              browser API helper and auth retry
  lib/auth/             server-only cookies, session, refresh, proxy helpers
  lib/env/              validated public and server environment access
  lib/http/             safe backend response handling
  providers/            query, theme, tooltip, and toast providers
  proxy.ts              protected-page verification and restore redirect
```

- Server Components own page metadata and static layout when practical.
- Client Components own forms, TanStack Query state, responsive navigation,
  composer state, and realtime subscriptions.
- Feature-local contract modules mirror the verified backend shapes.
- `AppProviders` owns one QueryClient per browser lifecycle.

## HTTP and refresh flow

1. Login route handler forwards credentials to auth service.
2. On success it stores access and refresh tokens as HttpOnly cookies plus the
   returned user ID/username as non-sensitive HttpOnly session metadata.
3. Protected route handlers read the access cookie and proxy with a bearer
   header.
4. On a 401, browser flows call the dedicated session-refresh route, whose
   process-local single-flight operation rotates cookies. Proxy and the
   socket-token route never rotate, avoiding cross-runtime reuse of the same
   refresh token. Failure clears all session cookies.
5. API errors keep the backend `errorCode` and user-safe `message`.

Session and socket-token responses explicitly use `Cache-Control: no-store`.
Token-bearing responses never enter shared or browser HTTP caches.

The process-local lock coalesces concurrent calls handled by the refresh route in
one Next runtime. It does not provide distributed locking across multiple
frontend instances; a horizontally scaled production deployment should add a
shared session coordinator or update the backend to issue/revoke cookies
directly.

## Server and realtime state

TanStack Query owns conversations and paginated message history. Query keys are
stable, feature-scoped, and include the authenticated user ID so data cannot
cross account boundaries. Socket events update or invalidate the smallest
relevant caches:

- `newMessage`: insert by message ID if absent.
- `messageEdited` / `messageDeleted`: replace by ID.
- `messageDelivered` / `messageRead`: update status by ID.
- reconnect: rejoin the active conversation and refetch its newest page.

The Socket.IO instance is created once per authenticated chat shell, uses an
in-memory access token, removes every listener during cleanup, and reconnects
with a bounded custom exponential backoff. A 20-second heartbeat maintains the
backend's 30-second presence TTL. The frontend never displays presence because
the backend does not expose it.

Sending uses Socket.IO with a UUID idempotency key and an acknowledgement
timeout. A pending message is explicit local state and is replaced by the raw
persisted message on acknowledgement or matching `newMessage`. Failed sends keep
their idempotency key for exact retry.

## UI behavior

- Desktop: fixed-width conversation rail plus flexible message panel.
- Mobile: conversation list and active conversation are separate views with an
  explicit back action.
- Direct chat titles fall back to a shortened participant UUID because no public
  profile endpoint exists. Group names are shown verbatim.
- Conversation search filters only already-loaded supported fields.
- No fake unread counts, last-message previews, avatars, conversation-list
  timestamps, or online states.
- Empty, loading, error, offline, and retry states are first-class.
- Long timelines remain bounded to the visual viewport; the message history
  scrolls independently while the header and composer stay available.
- Light, dark, and system appearance choices persist through `next-themes`.
- Coarse-pointer controls receive at least a 40px hit area, and tall mobile
  dialogs scroll within the viewport.
- Motion respects `prefers-reduced-motion`; all menus/dialogs are keyboard and
  screen-reader usable.

## Verification strategy

- Vitest and Testing Library for contract parsing, API helpers, authentication
  forms, timeline reconciliation, and socket event reducers.
- Playwright for login/register routing, secure session behavior, responsive
  navigation, long timelines, realtime reconnect/retry, theme persistence, and
  axe accessibility scans using a contract-faithful local backend fixture.
- Every milestone runs typecheck, lint, focused tests, and production build when
  applicable.
- UI milestones are checked in the browser at desktop and mobile widths against
  the accepted concept.

## Milestone and commit boundaries

1. `docs: record verified backend contract and frontend plan`
2. `chore: establish Next.js frontend foundation`
3. `feat: add secure authentication flow`
4. `feat: build responsive conversation interface`
5. `feat: integrate conversation and message APIs`
6. `feat: add realtime messaging lifecycle`
7. `fix: harden accessibility and product states`
8. `docs: finalize setup and verification guidance`
