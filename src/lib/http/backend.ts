import "server-only";

type BackendErrorBody = {
  errorCode?: unknown;
  message?: unknown;
};

export class BackendRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly errorCode?: string,
  ) {
    super(message);
    this.name = "BackendRequestError";
  }
}

function readableMessage(body: BackendErrorBody, fallback: string) {
  if (typeof body.message === "string" && body.message.trim()) {
    return body.message;
  }

  if (Array.isArray(body.message)) {
    const messages = body.message.filter(
      (item): item is string => typeof item === "string" && item.length > 0,
    );
    if (messages.length > 0) return messages.join(" ");
  }

  return fallback;
}

export async function readJsonSafely(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return null;

  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function throwForBackendError(
  response: Response,
  fallbackMessage: string,
) {
  if (response.ok) return;

  const rawBody = await readJsonSafely(response);
  const body =
    rawBody && typeof rawBody === "object"
      ? (rawBody as BackendErrorBody)
      : ({} as BackendErrorBody);

  throw new BackendRequestError(
    response.status,
    readableMessage(body, fallbackMessage),
    typeof body.errorCode === "string" ? body.errorCode : undefined,
  );
}

export function toClientError(reason: unknown, fallbackMessage: string) {
  if (reason instanceof BackendRequestError) {
    return Response.json(
      { message: reason.message, errorCode: reason.errorCode },
      { status: reason.status },
    );
  }

  return Response.json({ message: fallbackMessage }, { status: 502 });
}
