import {
  refreshWithBackend,
  verifyAccessWithBackend,
} from "@/lib/auth/backend-auth";
import {
  clearLoginSession,
  readSession,
  readSessionTokens,
  saveRotatedTokens,
} from "@/lib/auth/session";
import { BackendRequestError } from "@/lib/http/backend";
import { privateJson } from "@/lib/http/private-response";

export async function POST() {
  const session = await readSession();
  const { refreshToken } = await readSessionTokens();
  if (!session || !refreshToken) {
    await clearLoginSession();
    return privateJson({ message: "Sign in is required." }, { status: 401 });
  }

  try {
    const rotated = await refreshWithBackend(refreshToken);
    await verifyAccessWithBackend(rotated.accessToken, session.userId);
    await saveRotatedTokens(rotated);
    return privateJson({ authenticated: true, ...session });
  } catch (reason) {
    if (
      reason instanceof BackendRequestError &&
      [400, 401, 403].includes(reason.status)
    ) {
      await clearLoginSession();
      return privateJson(
        { message: "Your session has expired. Sign in again." },
        { status: 401 },
      );
    }
    return privateJson(
      { message: "Authentication is temporarily unavailable." },
      { status: 503 },
    );
  }
}
