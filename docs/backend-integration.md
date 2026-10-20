# HyperThread backend integration contract

Verified on 2026-10-20 against the backend checkout at
`/home/mithun/Documents/HyperThread`, branch `chore/production-readiness`, commit
`dfe78cd`. This branch is intentionally pinned because it differs from
`origin/main`; an unmerged local branch also contains a logout implementation
that is not part of the chosen contract. The pinned backend source is the
contract of record; the frontend must not invent endpoints or payload fields.

## Runtime and configuration

- Auth HTTP service: `http://localhost:4000` by default.
- Chat HTTP and Socket.IO service: `http://localhost:4001` by default.
- There is no global API prefix or custom Socket.IO namespace/path.
- Auth CORS uses `FRONTEND_URL`; chat HTTP and Socket.IO CORS use
  `CORS_ORIGINS`.
- Frontend server configuration: `AUTH_SERVICE_URL`, `CHAT_SERVICE_URL`.
- Browser-visible configuration: `NEXT_PUBLIC_SOCKET_URL` only. Never expose
  `INTERNAL_API_KEY` or JWT secrets.
- Local frontend port: `5000`, matching the backend's documented CORS examples.

Evidence: `apps/auth-service/src/main.ts:10-40`,
`apps/chat-service/src/main.ts:10-49`,
`apps/auth-service/src/config/env.validation.ts:3-11`, and
`apps/chat-service/src/config/env.validation.ts:3-13`.

## Authentication

All protected HTTP calls use `Authorization: Bearer <accessToken>`. Access and
refresh JWTs use HS256. The access token lasts 15 minutes; the refresh token and
database session last seven days.

| Method | Path | Request | Response |
| --- | --- | --- | --- |
| `POST` | `/auth/register` | `{ username, email, password }` | `201 { id, username, email }` |
| `POST` | `/auth/login` | `{ identifier, password }` | `{ userId, username, accessToken, refreshToken }` |
| `GET` | `/auth/me` | bearer token | JWT claims `{ sub, iat, exp }` |
| `POST` | `/auth/refresh` | `{ refreshToken }` | rotated `{ accessToken, refreshToken }` |

Registration rules: username is 3-30 alphanumeric/underscore characters;
password is 8-128 characters with an uppercase letter, lowercase letter, and
number; email must be valid. Registration does not sign the user in.

Refresh tokens rotate on every refresh. A reused token revokes the session, so
the frontend BFF must serialize refresh attempts. There is no backend logout or
session-revocation route.

Evidence: `apps/auth-service/src/auth/auth.controller.ts:19-44`,
`apps/auth-service/src/auth/dto/register.dto.ts:3-23`,
`apps/auth-service/src/auth/auth.service.ts:99-294`, and
`apps/auth-service/src/auth/guards/jwt-auth.guard.ts:16-60`.

The internal `GET /internal/users/:userId` route requires
`x-internal-api-key`. It is service-to-service only and must never be called by
the browser or exposed through the frontend. Evidence:
`apps/auth-service/src/auth/internal-users.controller.ts:11-34`.

## Conversations

Every route below requires the bearer access token.

| Method | Path | Request / behavior |
| --- | --- | --- |
| `GET` | `/conversations` | Unpaginated membership-filtered list, ordered by `updatedAt desc`, with member rows. |
| `GET` | `/conversations/:id` | One membership-filtered conversation with members. |
| `POST` | `/conversations/direct` | `{ recipientId: UUID }`; returns existing or new direct conversation. |
| `POST` | `/conversations/group` | `{ name, memberIds }`; name 2-50, at least two other unique UUIDs. |
| `POST` | `/conversations/:id/members` | `{ userId }`; group admin only. |
| `DELETE` | `/conversations/:id/members` | `{ userId }`; group admin only. |
| `DELETE` | `/conversations/:id/leave-group` | Leave a group; transfers admin when required. |
| `PATCH` | `/conversations/:id/name` | `{ name }`; group admin only. |

Conversation shape:

```ts
type Conversation = {
  id: string;
  type: "DIRECT" | "GROUP";
  name: string | null;
  directKey: string | null;
  createdAt: string;
  updatedAt: string;
  members: Array<{
    id: string;
    conversationId: string;
    userId: string;
    role: "ADMIN" | "MEMBER";
    joinedAt: string;
  }>;
};
```

Evidence: `apps/chat-service/src/conversations/conversation/conversation.controller.ts:22-121`,
`apps/chat-service/src/conversations/conversation/conversations.service.ts:27-199`,
and `apps/chat-service/prisma/schema.prisma:10-49`.

## Messages

| Method | Path | Request / response |
| --- | --- | --- |
| `GET` | `/conversations/:id/messages?limit=50&before=<messageId>` | `{ messages, hasMore, nextBefore }` |
| `POST` | `/conversations/:id/messages` | `{ content, idempotencyKey }` -> raw message |
| `PATCH` | `/conversations/:id/messages/:messageId` | `{ content }` -> edited message |
| `DELETE` | `/conversations/:id/messages/:messageId` | Soft-deleted message |

`limit` is 1-100. Pages are returned oldest-to-newest. When `hasMore` is true,
`nextBefore` is the oldest returned message ID. Message content is at most 4000
characters. The frontend additionally rejects whitespace-only sends.

```ts
type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  idempotencyKey: string;
  status: "SENT" | "DELIVERED" | "READ";
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
};
```

Idempotency is unique across `(senderId, idempotencyKey)`. Replaying the exact
request returns the existing message; reusing a key for different content or a
different conversation returns `409 IDEMPOTENCY_KEY_REUSED`.

Evidence: `apps/chat-service/src/message/message.controller.ts:23-104`,
`apps/chat-service/src/message/message.service.ts:43-195`,
`apps/chat-service/src/conversations/dto/send-message.dto.ts:3-27`, and
`apps/chat-service/prisma/schema.prisma:20-67`.

## Error envelope

HTTP failures use:

```ts
type ApiError = {
  errorCode: string;
  message: string;
  statusCode: number;
  timestamp: string;
  path: string;
};
```

Chat payload validation intentionally returns `VALIDATION_ERROR` with the
generic message `Invalid request payload`. Evidence:
`apps/auth-service/src/common/filters/http-exception.filter.ts:23-75`,
`apps/chat-service/src/common/filters/http-exception.filter.ts:23-67`, and
`apps/chat-service/src/main.ts:33-43`.

## Socket.IO contract

Connect to the default namespace with `auth: { token: accessToken }`. Missing,
invalid, or expired tokens cause a silent disconnect. Rooms are ephemeral;
rejoin the active conversation after every reconnect.

Client events:

| Event | Payload | Success event / ACK |
| --- | --- | --- |
| `joinConversation` | conversation UUID | `joinedConversation { conversationId }` |
| `sendMessage` | `{ conversationId, content, idempotencyKey }` | Socket ACK callback receives raw Message |
| `acknowledgeDelivery` | message UUID | `deliveryAcknowledged { messageId, status }` |
| `acknowledgeRead` | message UUID | `readAcknowledged { messageId, status }` |
| `typing` | conversation UUID | `typingAcknowledged { conversationId }` |
| `stopTyping` | conversation UUID | `stopTypingAcknowledged { conversationId }` |
| `heartbeat` | none | `heartbeat { status: "ok" }` |

Server events:

- `newMessage`: raw Message.
- `messageEdited`: raw Message.
- `messageDeleted`: raw Message.
- `messageDelivered` / `messageRead`:
  `{ messageId, conversationId, senderId, status }`.
- `userTyping` / `userStoppedTyping`: `{ conversationId, userId }`.
- `exception`: `{ errorCode, message }`.

Socket sends are limited to 10 per 60 seconds per user. Presence entries expire
after 30 seconds, so the frontend sends heartbeats every 20 seconds. Presence is
not queryable through any public API and there are no online/offline broadcasts.
Delivery/read acknowledgements are recipient-only and direct-chat-only.

Evidence: `apps/chat-service/src/realtime/chat.gateway.ts:31-512`,
`apps/chat-service/src/realtime/conversation-room.service.ts:15-43`, and
`apps/chat-service/src/redis/redis.service.ts:25-109`.

## Known limitations and product impact

- There is no public user discovery or username lookup; creating chats requires
  recipient UUIDs.
- Conversation rows contain member IDs, not profiles or avatars. The list has
  no last-message preview or unread count, so the frontend must not fabricate
  them.
- No public presence API exists. The UI may show connection state and typing,
  but not claim a participant is online.
- Message creation does not update `Conversation.updatedAt`, so backend list
  ordering does not reliably represent recent messaging activity.
- HTTP message sends persist but do not broadcast `newMessage`; realtime sends
  must use Socket.IO, with HTTP used as a documented fallback only.
- Conversation changes have no realtime events; refetch after mutations.
- Group message delivery/read status is not per-member and should not be shown
  as a group receipt.
- Unsupported: password reset, verification, OAuth/OTP, profile settings,
  attachments, reactions, forwarding, pinning, and backend logout/revocation.
- The current MVP intentionally accepts an ID-only direct-chat flow rather than
  adding an unverified user-discovery API.
- Logout is accurately described as signing out of this browser. It clears the
  BFF cookies and protected query caches but cannot revoke the backend session.
- Live integration was not available during discovery because ports 4000 and
  4001 were not listening. Backend unit/build verification passed independently;
  live service verification remains a Milestone 7 requirement.

