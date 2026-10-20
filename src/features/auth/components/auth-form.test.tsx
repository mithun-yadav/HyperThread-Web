import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthForm } from "./auth-form";

const replace = vi.fn();
const refresh = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh, push }),
}));

describe("AuthForm", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    replace.mockClear();
    refresh.mockClear();
    push.mockClear();
  });

  it("validates login before making a request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<AuthForm mode="login" />);

    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      await screen.findByText("Enter your email or username."),
    ).toBeVisible();
    expect(screen.getByText("Enter your password.")).toBeVisible();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("submits login through the same-origin BFF", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ userId: "u1", username: "mithun" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    render(<AuthForm mode="login" />);

    await userEvent.type(
      screen.getByRole("textbox", { name: "Email or username" }),
      "mithun",
    );
    await userEvent.type(screen.getByLabelText("Password"), "Thread123");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/auth/login",
      expect.objectContaining({ method: "POST" }),
    );
    expect(replace).toHaveBeenCalledWith("/chat");
  });

  it("shows the account-created handoff", () => {
    render(<AuthForm mode="login" registered />);
    expect(screen.getByText("Account created")).toBeVisible();
  });
});
