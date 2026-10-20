import { describe, expect, it } from "vitest";
import { loginSchema, registerSchema } from "./auth-contract";

describe("authentication schemas", () => {
  it("accepts the backend registration contract", () => {
    expect(
      registerSchema.safeParse({
        username: "mithun_team",
        email: "mithun@example.com",
        password: "Thread123",
      }).success,
    ).toBe(true);
  });

  it("rejects credentials the backend would reject", () => {
    const result = registerSchema.safeParse({
      username: "no spaces",
      email: "not-an-email",
      password: "lowercase",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.username).toBeDefined();
      expect(result.error.flatten().fieldErrors.email).toBeDefined();
      expect(result.error.flatten().fieldErrors.password).toBeDefined();
    }
  });

  it("requires both login fields", () => {
    expect(
      loginSchema.safeParse({ identifier: "", password: "" }).success,
    ).toBe(false);
  });
});
