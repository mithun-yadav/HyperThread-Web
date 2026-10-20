import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FoundationShell } from "./foundation-shell";

describe("FoundationShell", () => {
  it("renders an honest responsive shell without sample conversations", () => {
    render(<FoundationShell />);

    expect(screen.getByLabelText("HyperThread")).toBeInTheDocument();
    expect(
      screen.getByText("Your conversation space is ready"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/No sample conversation data is shown/),
    ).toBeInTheDocument();
  });
});
