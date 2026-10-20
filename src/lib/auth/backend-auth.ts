import "server-only";
import { createHash } from "node:crypto";
import {
  accessClaimsSchema,
  loginResponseSchema,
  refreshResponseSchema,
  registerResponseSchema,
  type LoginInput,
  type RefreshResponse,
  type RegisterInput,
} from "@/features/auth/auth-contract";
import { getServerEnv } from "@/lib/env/server";
import {
  BackendRequestError,
  readJsonSafely,
  throwForBackendError,
} from "@/lib/http/backend";

async function postAuth(path: string, body: unknown) {
  const { AUTH_SERVICE_URL } = getServerEnv();
  return fetch(`${AUTH_SERVICE_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
}

export async function loginWithBackend(input: LoginInput) {
  const response = await postAuth("/auth/login", input);
  await throwForBackendError(response, "We couldn't sign you in.");
  const result = loginResponseSchema.safeParse(await readJsonSafely(response));
  if (!result.success) {
    throw new BackendRequestError(502, "The sign-in response was invalid.");
  }
  return result.data;
}

export async function registerWithBackend(input: RegisterInput) {
  const response = await postAuth("/auth/register", input);
  await throwForBackendError(response, "We couldn't create your account.");
  const result = registerResponseSchema.safeParse(
    await readJsonSafely(response),
  );
  if (!result.success) {
    throw new BackendRequestError(
      502,
      "The registration response was invalid.",
    );
  }
  return result.data;
}

export async function logoutWithBackend(refreshToken: string) {
  const response = await postAuth("/auth/logout", { refreshToken });
  await throwForBackendError(
    response,
    "The server session could not be revoked.",
  );
}

export async function verifyAccessWithBackend(
  accessToken: string,
  expectedUserId?: string,
) {
  const { AUTH_SERVICE_URL } = getServerEnv();
  const response = await fetch(`${AUTH_SERVICE_URL}/auth/me`, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  await throwForBackendError(response, "Your session is no longer valid.");
  const claims = accessClaimsSchema.safeParse(await readJsonSafely(response));
  if (!claims.success) {
    throw new BackendRequestError(502, "The session response was invalid.");
  }
  if (expectedUserId && claims.data.sub !== expectedUserId) {
    throw new BackendRequestError(401, "The session identity did not match.");
  }
  return claims.data;
}

const refreshRequests = new Map<string, Promise<RefreshResponse>>();
const REFRESH_DEDUPLICATION_WINDOW_MS = 5_000;

async function rotateRefreshToken(refreshToken: string) {
  const response = await postAuth("/auth/refresh", { refreshToken });
  await throwForBackendError(response, "Your session could not be renewed.");
  const result = refreshResponseSchema.safeParse(
    await readJsonSafely(response),
  );
  if (!result.success) {
    throw new BackendRequestError(502, "The session response was invalid.");
  }
  return result.data;
}

export function refreshWithBackend(refreshToken: string) {
  const key = createHash("sha256").update(refreshToken).digest("hex");
  const existing = refreshRequests.get(key);
  if (existing) return existing;

  const pending = rotateRefreshToken(refreshToken).finally(() => {
    setTimeout(
      () => refreshRequests.delete(key),
      REFRESH_DEDUPLICATION_WINDOW_MS,
    );
  });
  refreshRequests.set(key, pending);
  return pending;
}
