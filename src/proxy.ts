import { type NextRequest, NextResponse } from "next/server";
import { verifyAccessWithBackend } from "@/lib/auth/backend-auth";
import {
  SESSION_COOKIES,
  sessionCookieOptions,
} from "@/lib/auth/cookie-config";
import { BackendRequestError } from "@/lib/http/backend";
import { PRIVATE_RESPONSE_HEADERS } from "@/lib/http/private-response";

type AuthenticationResult =
  | { state: "verified" }
  | { state: "refresh-required" }
  | { state: "anonymous" }
  | { state: "unavailable" };

async function authenticate(
  request: NextRequest,
): Promise<AuthenticationResult> {
  const userId = request.cookies.get(SESSION_COOKIES.userId)?.value;
  const username = request.cookies.get(SESSION_COOKIES.username)?.value;
  const accessToken = request.cookies.get(SESSION_COOKIES.accessToken)?.value;
  const refreshToken = request.cookies.get(SESSION_COOKIES.refreshToken)?.value;

  if (!userId || !username || !refreshToken) {
    return { state: "anonymous" };
  }

  if (accessToken) {
    try {
      await verifyAccessWithBackend(accessToken, userId);
      return { state: "verified" };
    } catch (reason) {
      if (
        !(reason instanceof BackendRequestError) ||
        ![401, 403].includes(reason.status)
      ) {
        return { state: "unavailable" };
      }
    }
  }

  return { state: "refresh-required" };
}

function cookieOptions(maxAge: number) {
  return sessionCookieOptions(maxAge, process.env.NODE_ENV === "production");
}

function clearCookies(response: NextResponse) {
  for (const name of Object.values(SESSION_COOKIES)) {
    response.cookies.set(name, "", cookieOptions(0));
  }
}

function unavailableResponse() {
  return new NextResponse("Authentication is temporarily unavailable.", {
    status: 503,
    headers: PRIVATE_RESPONSE_HEADERS,
  });
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isProtected = path === "/chat" || path.startsWith("/chat/");
  const isAuthPage = path === "/login" || path === "/register";
  const result = await authenticate(request);

  if (result.state === "unavailable" && !isAuthPage) {
    return unavailableResponse();
  }

  if (path === "/") {
    const destination =
      result.state === "verified"
        ? "/chat"
        : result.state === "refresh-required"
          ? "/session/restore?next=/chat"
          : "/login";
    const response = NextResponse.redirect(new URL(destination, request.url));
    if (result.state === "anonymous") clearCookies(response);
    return response;
  }

  if (result.state !== "verified") {
    if (isProtected) {
      if (result.state === "refresh-required") {
        return NextResponse.redirect(
          new URL(
            `/session/restore?next=${encodeURIComponent(path)}`,
            request.url,
          ),
        );
      }
      const loginResponse = NextResponse.redirect(
        new URL("/login", request.url),
      );
      clearCookies(loginResponse);
      return loginResponse;
    }
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-hyperthread-session", "anonymous");
    const response = NextResponse.next({
      request: { headers: requestHeaders },
    });
    clearCookies(response);
    return response;
  }

  if (isAuthPage) {
    return NextResponse.redirect(new URL("/chat", request.url));
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-hyperthread-session", "verified");
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/", "/login", "/register", "/chat/:path*"],
};
