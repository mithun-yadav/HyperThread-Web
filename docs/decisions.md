# Architecture decisions

## ADR-001: Next.js BFF owns browser credentials

The backend returns access and rotating refresh tokens in JSON. HyperThread Web
stores them in HttpOnly, SameSite cookies set by same-origin route handlers,
with `Secure` enabled in production. Client JavaScript receives only an access
token in memory when opening Socket.IO. This avoids persistent browser token
storage while preserving the backend contract.
Protected page requests are verified against `/auth/me` in Next Proxy and bound
to the session metadata user ID. Proxy marks only that request as verified for
the chat layout; cookie presence alone never authorizes a page. Token rotation is
owned by one dedicated route because Proxy and route handlers have separate
production runtimes.

## ADR-002: TanStack Query owns server state

Conversation and message data remain in TanStack Query. Component state owns
only presentation concerns. Zustand is intentionally absent until a real
cross-route client-state need appears.

## ADR-003: Socket.IO is the realtime send authority

The backend's HTTP message endpoint does not broadcast. The composer therefore
sends through Socket.IO and reconciles the persisted acknowledgement by message
ID. The HTTP endpoint is not presented as an equivalent realtime path.

## ADR-004: Unsupported metadata stays absent

The backend does not expose public user profiles, avatars, unread counts,
last-message previews, or online state. The frontend uses group names and
shortened user IDs and does not fabricate unsupported metadata.

## ADR-005: Appearance and accessibility are product state

Theme selection is explicit (`light`, `dark`, or `system`) and persists through
`next-themes`. Semantic tokens provide paired foreground/background colors in
both themes. Realtime connection loss is presented as visible guidance as well
as a single polite live status, mobile navigation restores focus to the selected
conversation, and reduced-motion preferences disable non-essential animation.
The chat shell is visual-viewport bounded so long histories scroll internally
without displacing the composer.

## ADR-006: Deterministic browser tests use a contract fixture

The end-to-end suite starts local auth, chat HTTP, and Socket.IO behavior that
matches the verified backend contract. This makes refresh races, reconnects,
idempotency, receipts, and responsive UI states repeatable in CI. It does not
claim deployment compatibility on its own, so real-service smoke status is
recorded separately in the testing guide.
