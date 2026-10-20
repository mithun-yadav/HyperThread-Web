import "server-only";
import { cookies } from "next/headers";
import type {
  AuthSession,
  LoginResponse,
  RefreshResponse,
} from "@/features/auth/auth-contract";
import {
  ACCESS_MAX_AGE,
  SESSION_COOKIES,
  SESSION_MAX_AGE,
  sessionCookieOptions,
} from "@/lib/auth/cookie-config";

function options(maxAge: number) {
  return sessionCookieOptions(maxAge, process.env.NODE_ENV === "production");
}

export async function saveLoginSession(session: LoginResponse) {
  const store = await cookies();
  store.set(
    SESSION_COOKIES.accessToken,
    session.accessToken,
    options(ACCESS_MAX_AGE),
  );
  store.set(
    SESSION_COOKIES.refreshToken,
    session.refreshToken,
    options(SESSION_MAX_AGE),
  );
  store.set(SESSION_COOKIES.userId, session.userId, options(SESSION_MAX_AGE));
  store.set(
    SESSION_COOKIES.username,
    session.username,
    options(SESSION_MAX_AGE),
  );
}

export async function saveRotatedTokens(tokens: RefreshResponse) {
  const store = await cookies();
  store.set(
    SESSION_COOKIES.accessToken,
    tokens.accessToken,
    options(ACCESS_MAX_AGE),
  );
  store.set(
    SESSION_COOKIES.refreshToken,
    tokens.refreshToken,
    options(SESSION_MAX_AGE),
  );
}

export async function clearLoginSession() {
  const store = await cookies();
  for (const name of Object.values(SESSION_COOKIES)) {
    store.set(name, "", options(0));
  }
}

export async function readSession(): Promise<AuthSession | null> {
  const store = await cookies();
  const userId = store.get(SESSION_COOKIES.userId)?.value;
  const username = store.get(SESSION_COOKIES.username)?.value;
  const refreshToken = store.get(SESSION_COOKIES.refreshToken)?.value;

  if (!userId || !username || !refreshToken) return null;
  return { userId, username };
}

export async function readSessionTokens() {
  const store = await cookies();
  return {
    accessToken: store.get(SESSION_COOKIES.accessToken)?.value ?? null,
    refreshToken: store.get(SESSION_COOKIES.refreshToken)?.value ?? null,
  };
}
