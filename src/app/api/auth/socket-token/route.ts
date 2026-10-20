import { getCurrentVerifiedAccessToken } from "@/lib/auth/session-restore";
import { readSession } from "@/lib/auth/session";
import { BackendRequestError } from "@/lib/http/backend";
import { privateJson } from "@/lib/http/private-response";

export async function GET() {
  if (!(await readSession())) {
    return privateJson({ message: "Sign in is required." }, { status: 401 });
  }

  try {
    return privateJson({ accessToken: await getCurrentVerifiedAccessToken() });
  } catch (reason) {
    if (
      reason instanceof BackendRequestError &&
      [400, 401, 403].includes(reason.status)
    ) {
      return privateJson(
        {
          message: "Refresh the session before reconnecting.",
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
}
