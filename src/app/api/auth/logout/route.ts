import { logoutWithBackend } from "@/lib/auth/backend-auth";
import { clearLoginSession, readSessionTokens } from "@/lib/auth/session";
import { BackendRequestError } from "@/lib/http/backend";
import { privateJson } from "@/lib/http/private-response";

const TERMINAL_LOGOUT_STATUSES = new Set([400, 401, 403]);

export async function POST() {
  const { refreshToken } = await readSessionTokens();
  let revocationUnavailable = false;

  try {
    if (refreshToken) await logoutWithBackend(refreshToken);
  } catch (reason) {
    revocationUnavailable = !(
      reason instanceof BackendRequestError &&
      TERMINAL_LOGOUT_STATUSES.has(reason.status)
    );
  } finally {
    await clearLoginSession();
  }

  if (revocationUnavailable) {
    return privateJson(
      {
        message:
          "You were signed out locally, but the server session could not be revoked.",
      },
      { status: 503 },
    );
  }

  return new Response(null, { status: 204 });
}
