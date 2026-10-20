import {
  directConversationRequestSchema,
  groupConversationRequestSchema,
} from "@/features/chat/chat-contract";
import { readSession } from "@/lib/auth/session";
import { getCurrentVerifiedAccessToken } from "@/lib/auth/session-restore";
import { getServerEnv } from "@/lib/env/server";
import { BackendRequestError } from "@/lib/http/backend";
import {
  PRIVATE_RESPONSE_HEADERS,
  privateJson,
} from "@/lib/http/private-response";

const allowedRoutes: Array<{ method: string; pattern: RegExp }> = [
  { method: "GET", pattern: /^conversations$/ },
  { method: "GET", pattern: /^conversations\/[0-9a-f-]+$/i },
  { method: "GET", pattern: /^conversations\/[0-9a-f-]+\/messages$/i },
  { method: "POST", pattern: /^conversations\/(direct|group)$/ },
];

function isAllowed(method: string, path: string) {
  return allowedRoutes.some(
    (route) => route.method === method && route.pattern.test(path),
  );
}

async function proxyChatRequest(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await context.params;
  const path = segments.join("/");
  if (!isAllowed(request.method, path)) {
    return privateJson({ message: "Chat route not found." }, { status: 404 });
  }

  let accessToken: string;
  try {
    accessToken = await getCurrentVerifiedAccessToken();
  } catch (reason) {
    if (
      reason instanceof BackendRequestError &&
      [400, 401, 403].includes(reason.status)
    ) {
      return privateJson(
        {
          message: "Refresh the session and try again.",
          errorCode: "REFRESH_REQUIRED",
        },
        { status: 401 },
      );
    }
    return privateJson(
      { message: "Authentication is temporarily unavailable." },
      { status: 503 },
    );
  }

  const incomingUrl = new URL(request.url);
  const { CHAT_SERVICE_URL } = getServerEnv();
  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${accessToken}`,
  });
  const hasBody = !["GET", "HEAD"].includes(request.method);
  if (hasBody) headers.set("content-type", "application/json");
  let requestBody: string | undefined;
  if (hasBody) {
    requestBody = await request.text();
    let body: unknown;
    try {
      body = JSON.parse(requestBody);
    } catch {
      return privateJson(
        { message: "Invalid request payload." },
        { status: 400 },
      );
    }
    const schema = path.endsWith("/direct")
      ? directConversationRequestSchema
      : groupConversationRequestSchema;
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return privateJson(
        { message: "Invalid request payload." },
        { status: 400 },
      );
    }
    const session = await readSession();
    const participantIds =
      "recipientId" in parsed.data
        ? [parsed.data.recipientId]
        : parsed.data.memberIds;
    const normalizedUserId = session?.userId.toLowerCase();
    if (
      normalizedUserId &&
      participantIds.some(
        (participantId) => participantId.toLowerCase() === normalizedUserId,
      )
    ) {
      return privateJson(
        {
          message:
            "Use IDs for other users; your own ID is added automatically.",
        },
        { status: 400 },
      );
    }
    requestBody = JSON.stringify(parsed.data);
  }

  try {
    const backendResponse = await fetch(
      `${CHAT_SERVICE_URL}/${path}${incomingUrl.search}`,
      {
        method: request.method,
        headers,
        body: requestBody,
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
      },
    );
    const responseHeaders = new Headers(PRIVATE_RESPONSE_HEADERS);
    responseHeaders.set(
      "content-type",
      backendResponse.headers.get("content-type") ?? "application/json",
    );
    return new Response(await backendResponse.arrayBuffer(), {
      status: backendResponse.status,
      headers: responseHeaders,
    });
  } catch {
    return privateJson(
      { message: "The chat service is temporarily unavailable." },
      { status: 502 },
    );
  }
}

export const GET = proxyChatRequest;
export const POST = proxyChatRequest;
