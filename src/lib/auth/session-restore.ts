import "server-only";
import { verifyAccessWithBackend } from "@/lib/auth/backend-auth";
import { readSession, readSessionTokens } from "@/lib/auth/session";
import { BackendRequestError } from "@/lib/http/backend";

export async function getCurrentVerifiedAccessToken() {
  const session = await readSession();
  const tokens = await readSessionTokens();
  if (!session || !tokens.accessToken) {
    throw new BackendRequestError(401, "Session refresh is required.");
  }
  await verifyAccessWithBackend(tokens.accessToken, session.userId);
  return tokens.accessToken;
}
