import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CreateConversationDialog } from "./create-conversation-dialog";

const currentUserId = "550e8400-e29b-41d4-a716-446655440000";

describe("CreateConversationDialog", () => {
  it("announces mode and rejects a self-chat", async () => {
    const onCreate = vi.fn();
    render(
      <CreateConversationDialog
        currentUserId={currentUserId}
        onCreate={onCreate}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "New conversation" }),
    );
    expect(screen.getByRole("button", { name: "Direct" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await userEvent.type(
      screen.getByLabelText("Recipient user ID"),
      currentUserId.toUpperCase(),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Create conversation" }),
    );
    expect(
      screen.getByText(/your own ID is added automatically/i),
    ).toBeVisible();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("submits a valid group of other users", async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(
      <CreateConversationDialog
        currentUserId={currentUserId}
        onCreate={onCreate}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "New conversation" }),
    );
    await userEvent.click(screen.getByRole("button", { name: /Group/ }));
    expect(screen.getByRole("button", { name: /Group/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await userEvent.type(screen.getByLabelText("Group name"), "Design crew");
    await userEvent.type(
      screen.getByLabelText("Member 1 user ID"),
      "6ba7b810-9dad-41d1-80b4-00c04fd430c8",
    );
    await userEvent.type(
      screen.getByLabelText("Member 2 user ID"),
      "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Create conversation" }),
    );
    expect(onCreate).toHaveBeenCalledWith({
      type: "GROUP",
      name: "Design crew",
      memberIds: [
        "6ba7b810-9dad-41d1-80b4-00c04fd430c8",
        "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      ],
    });
  });
});
