import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { Server as SocketServer } from "socket.io";

const refreshCounts = new Map();
const logoutCounts = new Map();

function send(response, status, body, contentType = "application/json") {
  response.writeHead(status, { "content-type": contentType });
  response.end(
    contentType === "application/json" ? JSON.stringify(body) : body,
  );
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

const authServer = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost:4100");

  if (request.method === "GET" && url.pathname === "/test/stats") {
    return send(response, 200, {
      refreshCount: refreshCounts.get(url.searchParams.get("token")) ?? 0,
    });
  }

  if (request.method === "GET" && url.pathname === "/test/logout-stats") {
    return send(response, 200, {
      logoutCount: logoutCounts.get(url.searchParams.get("userId")) ?? 0,
    });
  }

  if (request.method === "POST" && url.pathname === "/auth/login") {
    const body = await readBody(request);
    if (body.identifier === "html-error") {
      return send(response, 500, "upstream failure", "text/html");
    }
    if (!body.identifier || !body.password) {
      return send(response, 401, {
        errorCode: "UNAUTHORIZED",
        message: "Invalid credentials",
      });
    }
    return send(response, 200, {
      userId: `user-${body.identifier}`,
      username: body.identifier,
      accessToken: `access-${body.identifier}`,
      refreshToken: `refresh-${body.identifier}`,
    });
  }

  if (request.method === "POST" && url.pathname === "/auth/register") {
    const body = await readBody(request);
    return send(response, 201, {
      id: `user-${body.username}`,
      username: body.username,
      email: body.email,
    });
  }

  if (request.method === "GET" && url.pathname === "/auth/me") {
    const accessToken = request.headers.authorization?.replace("Bearer ", "");
    let subject = null;
    if (accessToken?.startsWith("access-")) {
      subject = `user-${accessToken.slice("access-".length)}`;
    }
    if (accessToken?.startsWith("rotated-access-refresh-")) {
      subject = `user-${accessToken.slice("rotated-access-refresh-".length)}`;
    }
    if (
      accessToken?.startsWith("access-") ||
      accessToken?.startsWith("rotated-access-")
    ) {
      return send(response, 200, {
        sub: subject,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 900,
      });
    }
    return send(response, 401, {
      errorCode: "UNAUTHORIZED",
      message: "Invalid access token",
    });
  }

  if (request.method === "POST" && url.pathname === "/auth/refresh") {
    const { refreshToken } = await readBody(request);
    if (!refreshToken || refreshToken.startsWith("invalid")) {
      return send(response, 401, {
        errorCode: "UNAUTHORIZED",
        message: "Invalid refresh token",
      });
    }
    refreshCounts.set(refreshToken, (refreshCounts.get(refreshToken) ?? 0) + 1);
    await new Promise((resolve) => setTimeout(resolve, 120));
    return send(response, 200, {
      accessToken: `rotated-access-${refreshToken}`,
      refreshToken: `${refreshToken}-rotated`,
    });
  }

  if (request.method === "POST" && url.pathname === "/auth/logout") {
    const { refreshToken } = await readBody(request);
    if (!refreshToken || !refreshToken.startsWith("refresh-")) {
      return send(response, 401, {
        errorCode: "AUTH_INVALID_REFRESH_TOKEN",
        message: "Invalid refresh token",
      });
    }
    const userId = `user-${refreshToken.slice("refresh-".length)}`;
    logoutCounts.set(userId, (logoutCounts.get(userId) ?? 0) + 1);
    response.writeHead(204);
    response.end();
    return;
  }

  return send(response, 404, { message: "Not found" });
});

authServer.listen(4100, "127.0.0.1");

const conversationsByUser = new Map();
const realtimeMessagesByUser = new Map();
const realtimeAttempts = new Map();
const socketStatsByUser = new Map();

function userFromAuthorization(request) {
  const token = request.headers.authorization?.replace("Bearer ", "") ?? "";
  if (token.startsWith("access-"))
    return `user-${token.slice("access-".length)}`;
  return "fixture-user";
}

function userFromSocketToken(token) {
  if (typeof token === "string" && token.startsWith("access-")) {
    return `user-${token.slice("access-".length)}`;
  }
  if (
    typeof token === "string" &&
    token.startsWith("rotated-access-refresh-")
  ) {
    return `user-${token.slice("rotated-access-refresh-".length)}`;
  }
  return null;
}

function realtimeKey(userId, conversationId) {
  return `${userId}:${conversationId}`;
}

function messagesFor(userId, conversationId) {
  const key = realtimeKey(userId, conversationId);
  const existing = realtimeMessagesByUser.get(key);
  if (existing) return existing;
  const messages = [];
  realtimeMessagesByUser.set(key, messages);
  return messages;
}

function statsFor(userId) {
  const existing = socketStatsByUser.get(userId);
  if (existing) return existing;
  const stats = {
    connections: 0,
    heartbeats: 0,
    joins: [],
    attempts: [],
    receipts: [],
  };
  socketStatsByUser.set(userId, stats);
  return stats;
}

function conversationFor(userId) {
  const existing = conversationsByUser.get(userId);
  if (existing) return existing;
  const conversationId = "11111111-1111-4111-8111-111111111111";
  const conversation = {
    id: conversationId,
    type: "GROUP",
    name: "Project room",
    directKey: null,
    createdAt: "2026-01-01T10:00:00.000Z",
    updatedAt: "2026-01-01T10:00:00.000Z",
    members: [
      {
        id: randomUUID(),
        conversationId,
        userId,
        role: "ADMIN",
        joinedAt: "2026-01-01T10:00:00.000Z",
      },
      {
        id: randomUUID(),
        conversationId,
        userId: "550e8400-e29b-41d4-a716-446655440000",
        role: "MEMBER",
        joinedAt: "2026-01-01T10:00:00.000Z",
      },
    ],
  };
  const list = [conversation];
  conversationsByUser.set(userId, list);
  return list;
}

const chatServer = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost:4101");
  const userId = userFromAuthorization(request);
  const conversations = conversationFor(userId);

  if (request.method === "GET" && url.pathname === "/test/socket-stats") {
    return send(response, 200, statsFor(url.searchParams.get("userId")));
  }

  if (request.method === "POST" && url.pathname === "/test/inject-message") {
    const body = await readBody(request);
    const message = {
      id: randomUUID(),
      conversationId: body.conversationId,
      senderId: body.senderId ?? "550e8400-e29b-41d4-a716-446655440000",
      content: body.content,
      idempotencyKey: randomUUID(),
      status: "SENT",
      createdAt: new Date().toISOString(),
      editedAt: null,
      deletedAt: null,
    };
    messagesFor(body.userId, body.conversationId).push(message);
    return send(response, 201, message);
  }

  if (request.method === "POST" && url.pathname === "/test/typing") {
    const body = await readBody(request);
    socketServer
      .to(realtimeKey(body.userId, body.conversationId))
      .emit("userTyping", {
        conversationId: body.conversationId,
        userId: body.typingUserId,
      });
    return send(response, 204, {});
  }

  if (request.method === "POST" && url.pathname === "/test/broadcast-message") {
    const body = await readBody(request);
    const message = messagesFor(body.userId, body.conversationId).find(
      (candidate) => candidate.id === body.id,
    );
    if (!message) return send(response, 404, { message: "Not found" });
    socketServer
      .to(realtimeKey(body.userId, body.conversationId))
      .emit("newMessage", message);
    return send(response, 204, {});
  }

  if (request.method === "POST" && url.pathname === "/test/disconnect") {
    const body = await readBody(request);
    for (const socket of socketServer.sockets.sockets.values()) {
      if (socket.data.userId === body.userId) socket.disconnect(true);
    }
    return send(response, 204, {});
  }

  if (request.method === "GET" && url.pathname === "/conversations") {
    return send(response, 200, conversations);
  }

  if (
    request.method === "GET" &&
    /^\/conversations\/[0-9a-f-]+\/messages$/i.test(url.pathname)
  ) {
    const conversationId = url.pathname.split("/")[2];
    const isSeedConversation =
      conversationId === "11111111-1111-4111-8111-111111111111";
    const loadingOlderPage = url.searchParams.has("before");
    const realtimeMessages = messagesFor(userId, conversationId);
    return send(response, 200, {
      messages: isSeedConversation
        ? loadingOlderPage
          ? [
              {
                id: "33333333-3333-4333-8333-333333333333",
                conversationId,
                senderId: "550e8400-e29b-41d4-a716-446655440000",
                content: "Earlier project context",
                idempotencyKey: "55555555-5555-4555-8555-555555555555",
                status: "SENT",
                createdAt: "2026-01-01T09:30:00.000Z",
                editedAt: null,
                deletedAt: null,
              },
            ]
          : [
              {
                id: "22222222-2222-4222-8222-222222222222",
                conversationId,
                senderId: "550e8400-e29b-41d4-a716-446655440000",
                content: "Hello from the project room",
                idempotencyKey: "44444444-4444-4444-8444-444444444444",
                status: "SENT",
                createdAt: "2026-01-01T10:30:00.000Z",
                editedAt: null,
                deletedAt: null,
              },
              ...realtimeMessages,
            ]
        : realtimeMessages,
      hasMore: isSeedConversation && !loadingOlderPage,
      nextBefore:
        isSeedConversation && !loadingOlderPage ? "older-anchor" : null,
    });
  }

  if (
    request.method === "POST" &&
    ["/conversations/direct", "/conversations/group"].includes(url.pathname)
  ) {
    const body = await readBody(request);
    const direct = url.pathname.endsWith("/direct");
    const conversationId = randomUUID();
    const memberIds = direct ? [body.recipientId] : body.memberIds;
    const conversation = {
      id: conversationId,
      type: direct ? "DIRECT" : "GROUP",
      name: direct ? null : body.name,
      directKey: direct ? [userId, body.recipientId].sort().join(":") : null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      members: [userId, ...memberIds].map((memberUserId, index) => ({
        id: randomUUID(),
        conversationId,
        userId: memberUserId,
        role: index === 0 ? "ADMIN" : "MEMBER",
        joinedAt: new Date().toISOString(),
      })),
    };
    conversations.unshift(conversation);
    return send(response, 201, conversation);
  }

  return send(response, 404, { message: "Not found" });
});

const socketServer = new SocketServer(chatServer, {
  cors: { origin: true, credentials: true },
});

socketServer.use((socket, next) => {
  const userId = userFromSocketToken(socket.handshake.auth.token);
  if (!userId) {
    next(new Error("Unauthorized"));
    return;
  }
  socket.data.userId = userId;
  next();
});

socketServer.on("connection", (socket) => {
  const userId = socket.data.userId;
  const stats = statsFor(userId);
  stats.connections += 1;

  socket.on("joinConversation", (conversationId) => {
    socket.join(realtimeKey(userId, conversationId));
    stats.joins.push(conversationId);
    socket.emit("joinedConversation", { conversationId });
  });

  socket.on("heartbeat", (acknowledge) => {
    stats.heartbeats += 1;
    if (typeof acknowledge === "function") {
      acknowledge({ event: "heartbeat", data: { status: "ok" } });
    }
  });

  socket.on("sendMessage", (payload, acknowledge) => {
    stats.attempts.push({ ...payload });
    const attemptKey = `${userId}:${payload.idempotencyKey}`;
    const attempt = (realtimeAttempts.get(attemptKey) ?? 0) + 1;
    realtimeAttempts.set(attemptKey, attempt);
    if (payload.content === "Retry this safely" && attempt === 1) {
      socket.emit("exception", {
        errorCode: "INTERNAL_ERROR",
        message: "Temporary realtime failure.",
      });
      return;
    }

    const messages = messagesFor(userId, payload.conversationId);
    let message = messages.find(
      (candidate) => candidate.idempotencyKey === payload.idempotencyKey,
    );
    if (!message) {
      message = {
        id: randomUUID(),
        conversationId: payload.conversationId,
        senderId: userId,
        content: payload.content,
        idempotencyKey: payload.idempotencyKey,
        status: "SENT",
        createdAt: new Date().toISOString(),
        editedAt: null,
        deletedAt: null,
      };
      messages.push(message);
    }
    if (payload.content === "Persist during disconnect" && attempt === 1) {
      socket.disconnect(true);
      return;
    }
    acknowledge(message);
    socketServer
      .to(realtimeKey(userId, payload.conversationId))
      .emit("newMessage", message);
  });

  socket.on("typing", (conversationId) => {
    socket
      .to(realtimeKey(userId, conversationId))
      .emit("userTyping", { conversationId, userId });
  });
  socket.on("stopTyping", (conversationId) => {
    socket
      .to(realtimeKey(userId, conversationId))
      .emit("userStoppedTyping", { conversationId, userId });
  });
  socket.on("acknowledgeDelivery", (messageId) => {
    stats.receipts.push({ type: "delivery", messageId });
    for (const [key, messages] of realtimeMessagesByUser) {
      if (!key.startsWith(`${userId}:`)) continue;
      const message = messages.find((candidate) => candidate.id === messageId);
      if (!message) continue;
      message.status = "DELIVERED";
      socketServer.to(key).emit("messageDelivered", {
        messageId,
        conversationId: message.conversationId,
        senderId: message.senderId,
        status: message.status,
      });
    }
  });
  socket.on("acknowledgeRead", (messageId) => {
    stats.receipts.push({ type: "read", messageId });
    for (const [key, messages] of realtimeMessagesByUser) {
      if (!key.startsWith(`${userId}:`)) continue;
      const message = messages.find((candidate) => candidate.id === messageId);
      if (!message) continue;
      message.status = "READ";
      socketServer.to(key).emit("messageRead", {
        messageId,
        conversationId: message.conversationId,
        senderId: message.senderId,
        status: message.status,
      });
    }
  });
});

chatServer.listen(4101, "127.0.0.1");

function close() {
  socketServer.disconnectSockets(true);
  let openServers = 2;
  const closed = () => {
    openServers -= 1;
    if (openServers === 0) process.exit(0);
  };
  authServer.close(closed);
  chatServer.close(closed);
}

process.on("SIGTERM", close);
process.on("SIGINT", close);
