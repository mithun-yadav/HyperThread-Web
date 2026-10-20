import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SignOutButton } from "./sign-out-button";

const routerMocks = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => routerMocks,
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("SignOutButton", () => {
  it("clears chat state and leaves the page after local-only logout", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(
      ["chat", "user-1", "conversations"],
      [{ id: "conversation-1" }],
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json({ message: "Signed out locally." }, { status: 503 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <QueryClientProvider client={queryClient}>
        <SignOutButton />
      </QueryClientProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => {
      expect(routerMocks.replace).toHaveBeenCalledWith("/login");
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", {
      method: "POST",
    });
    expect(
      queryClient.getQueryData(["chat", "user-1", "conversations"]),
    ).toBeUndefined();
    expect(routerMocks.refresh).toHaveBeenCalledOnce();
  });
});
