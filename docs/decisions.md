# Architecture decisions

## ADR-001: Next.js BFF owns browser credentials

The backend returns access and rotating refresh tokens in JSON. HyperThread Web
stores them in secure HttpOnly cookies set by same-origin route handlers. Client
JavaScript receives only an access token in memory when opening Socket.IO. This
avoids persistent browser token storage while preserving the backend contract.

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
