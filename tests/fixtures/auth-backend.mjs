import { randomUUID } from "node:crypto";
import { createServer } from "node:http";

const refreshCounts = new Map();

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

  return send(response, 404, { message: "Not found" });
});

authServer.listen(4100, "127.0.0.1");

const conversationsByUser = new Map();

function userFromAuthorization(request) {
  const token = request.headers.authorization?.replace("Bearer ", "") ?? "";
  if (token.startsWith("access-"))
    return `user-${token.slice("access-".length)}`;
  return "fixture-user";
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
    return send(response, 200, {
      messages: isSeedConversation
        ? [
            {
              id: loadingOlderPage
                ? "33333333-3333-4333-8333-333333333333"
                : "22222222-2222-4222-8222-222222222222",
              conversationId,
              senderId: "550e8400-e29b-41d4-a716-446655440000",
              content: loadingOlderPage
                ? "Earlier project context"
                : "Hello from the project room",
              idempotencyKey: loadingOlderPage
                ? "55555555-5555-4555-8555-555555555555"
                : "44444444-4444-4444-8444-444444444444",
              status: "SENT",
              createdAt: loadingOlderPage
                ? "2026-01-01T09:30:00.000Z"
                : "2026-01-01T10:30:00.000Z",
              editedAt: null,
              deletedAt: null,
            },
          ]
        : [],
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

chatServer.listen(4101, "127.0.0.1");

function close() {
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
