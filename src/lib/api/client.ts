import { z } from "zod";

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly errorCode?: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

type RefreshOutcome = "refreshed" | "expired" | "unavailable";

let refreshRequest: Promise<RefreshOutcome> | null = null;

async function refreshSession() {
  if (refreshRequest) return refreshRequest;
  const pending = fetch("/api/auth/session/refresh", { method: "POST" })
    .then((response): RefreshOutcome => {
      if (response.ok) return "refreshed";
      return response.status === 401 ? "expired" : "unavailable";
    })
    .catch((): RefreshOutcome => "unavailable")
    .finally(() => {
      window.setTimeout(() => {
        if (refreshRequest === pending) refreshRequest = null;
      }, 2_000);
    });
  refreshRequest = pending;
  return pending;
}

async function readBody(response: Response) {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

async function request(path: string, init: RequestInit, retry: boolean) {
  const response = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...init.headers },
  });

  if (response.status === 401 && retry) {
    const outcome = await refreshSession();
    if (outcome === "refreshed") return request(path, init, false);
    if (outcome === "expired") {
      throw new ApiClientError(
        "Your session has expired. Sign in again.",
        401,
        "SESSION_EXPIRED",
      );
    }
    throw new ApiClientError(
      "Authentication is temporarily unavailable. Try again.",
      503,
      "AUTH_UNAVAILABLE",
    );
  }

  const body = await readBody(response);
  if (!response.ok) {
    const candidate = body && typeof body === "object" ? body : {};
    const message =
      "message" in candidate && typeof candidate.message === "string"
        ? candidate.message
        : "The request could not be completed.";
    const errorCode =
      "errorCode" in candidate && typeof candidate.errorCode === "string"
        ? candidate.errorCode
        : undefined;
    throw new ApiClientError(message, response.status, errorCode);
  }
  return body;
}

export async function apiJson<T>(
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit = {},
) {
  const parsed = schema.safeParse(await request(path, init, true));
  if (!parsed.success) {
    throw new ApiClientError("The server returned an invalid response.", 502);
  }
  return parsed.data;
}
