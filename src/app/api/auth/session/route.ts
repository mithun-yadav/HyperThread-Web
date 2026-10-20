import { getCurrentVerifiedAccessToken } from "@/lib/auth/session-restore";
import { readSession } from "@/lib/auth/session";
import { BackendRequestError } from "@/lib/http/backend";
import { privateJson } from "@/lib/http/private-response";

export async function GET() {
  const session = await readSession();
  if (!session) {
    return privateJson({ authenticated: false }, { status: 401 });
  }

  try {
    await getCurrentVerifiedAccessToken();
  } catch (reason) {
    if (
      reason instanceof BackendRequestError &&
      [400, 401, 403].includes(reason.status)
    ) {
      return privateJson(
        { authenticated: false, errorCode: "REFRESH_REQUIRED" },
        { status: 401 },
      );
    }
    return privateJson(
      { message: "Authentication is temporarily unavailable." },
      { status: 503 },
    );
  }

  return privateJson({ authenticated: true, ...session });
}
