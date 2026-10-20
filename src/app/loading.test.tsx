import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Loading from "./loading";

describe("Loading", () => {
  it("announces visible loading feedback", () => {
    render(<Loading />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading HyperThread");
  });
});
