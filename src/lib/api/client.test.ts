import { z } from "zod";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("apiJson session recovery", () => {
  it("retries the original request once after a successful refresh", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        Response.json({ value: "restored" }, { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { apiJson } = await import("./client");

    await expect(
      apiJson("/api/chat/conversations", z.object({ value: z.string() })),
    ).resolves.toEqual({ value: "restored" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("keeps a transient refresh failure retryable", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 401 }))
        .mockResolvedValueOnce(new Response(null, { status: 503 })),
    );
    const { apiJson } = await import("./client");

    await expect(
      apiJson("/api/chat/conversations", z.unknown()),
    ).rejects.toEqual(
      expect.objectContaining({
        status: 503,
        errorCode: "AUTH_UNAVAILABLE",
      }),
    );
  });

  it("reports an invalid refresh token as an expired session", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 401 }))
        .mockResolvedValueOnce(new Response(null, { status: 401 })),
    );
    const { apiJson } = await import("./client");

    await expect(
      apiJson("/api/chat/conversations", z.unknown()),
    ).rejects.toEqual(
      expect.objectContaining({
        status: 401,
        errorCode: "SESSION_EXPIRED",
      }),
    );
  });
});
