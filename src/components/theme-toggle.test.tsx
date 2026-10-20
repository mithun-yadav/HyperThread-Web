import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "./theme-toggle";

const setTheme = vi.fn();

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "system", setTheme }),
}));

describe("ThemeToggle", () => {
  it("offers explicit light, dark, and system appearance choices", async () => {
    render(<ThemeToggle />);
    await userEvent.click(
      screen.getByRole("button", { name: "Choose appearance" }),
    );
    expect(screen.getByRole("menuitemradio", { name: /Light/ })).toBeVisible();
    expect(screen.getByRole("menuitemradio", { name: /System/ })).toBeVisible();
    await userEvent.click(screen.getByRole("menuitemradio", { name: /Dark/ }));
    expect(setTheme).toHaveBeenCalledWith("dark");
  });
});
