import { afterEach, describe, expect, it, vi } from "vitest";
import { getClientEnv } from "./client";

describe("client environment", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the documented local socket service by default", () => {
    expect(getClientEnv().NEXT_PUBLIC_SOCKET_URL).toBe("http://localhost:4001");
  });

  it("requires an explicit socket URL in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SOCKET_URL", "");

    expect(() => getClientEnv()).toThrow();
  });
});
