import { describe, expect, it } from "vitest";
import { ACCESS_MAX_AGE, sessionCookieOptions } from "./cookie-config";

describe("sessionCookieOptions", () => {
  it("uses hardened production cookie attributes", () => {
    expect(sessionCookieOptions(ACCESS_MAX_AGE, true)).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      priority: "high",
    });
  });
});
