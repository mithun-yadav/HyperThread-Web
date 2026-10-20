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

const server = createServer(async (request, response) => {
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

server.listen(4100, "127.0.0.1");

function close() {
  server.close(() => process.exit(0));
}

process.on("SIGTERM", close);
process.on("SIGINT", close);
