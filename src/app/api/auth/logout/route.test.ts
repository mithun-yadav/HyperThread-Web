import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_COOKIES } from "@/lib/auth/cookie-config";

const cookieMocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: cookieMocks.cookies }));

import { POST } from "./route";

const refreshToken = "refresh-token-must-stay-server-side";

function provideRefreshCookie(value: string | null) {
  cookieMocks.get.mockImplementation((name: string) =>
    name === SESSION_COOKIES.refreshToken && value
      ? { name, value }
      : undefined,
  );
}

function expectAllAuthenticationCookiesCleared() {
  expect(cookieMocks.set).toHaveBeenCalledTimes(4);
  for (const name of Object.values(SESSION_COOKIES)) {
    expect(cookieMocks.set).toHaveBeenCalledWith(
      name,
      "",
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      }),
    );
  }
}

beforeEach(() => {
  cookieMocks.cookies.mockResolvedValue({
    get: cookieMocks.get,
    set: cookieMocks.set,
  });
  vi.stubEnv("AUTH_SERVICE_URL", "https://auth.example.test");
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("POST /api/auth/logout", () => {
  it("revokes the backend session and clears every local auth cookie", async () => {
    provideRefreshCookie(refreshToken);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST();

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://auth.example.test/auth/logout");
    expect(init).toMatchObject({
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(init.body))).toEqual({ refreshToken });
    expect(url).not.toContain(refreshToken);
    expectAllAuthenticationCookiesCleared();
  });

  it("clears local cookies without calling the backend when refresh is absent", async () => {
    provideRefreshCookie(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST();

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(fetchMock).not.toHaveBeenCalled();
    expectAllAuthenticationCookiesCleared();
  });

  it.each([400, 401, 403])(
    "treats a terminal backend %s response as locally logged out",
    async (status) => {
      provideRefreshCookie(refreshToken);
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          Response.json(
            {
              message: `Backend rejected ${refreshToken}`,
              errorCode: "AUTH_INVALID_REFRESH_TOKEN",
            },
            { status },
          ),
        ),
      );

      const response = await POST();

      expect(response.status).toBe(204);
      expect(await response.text()).toBe("");
      expectAllAuthenticationCookiesCleared();
    },
  );

  it.each([
    new DOMException("The request timed out", "TimeoutError"),
    new TypeError("The network is unavailable"),
  ])(
    "reports unavailable revocation without exposing credentials",
    async (failure) => {
      provideRefreshCookie(refreshToken);
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(failure));

      const response = await POST();
      const body = await response.text();

      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(body).toContain("signed out locally");
      expect(body).not.toContain(refreshToken);
      expect(body).not.toContain(failure.message);
      expectAllAuthenticationCookiesCleared();
    },
  );
});
