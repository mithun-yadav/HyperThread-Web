import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Conversation, Message } from "@/features/chat/chat-contract";
import { ConversationPanel } from "./conversation-panel";

const conversation: Conversation = {
  id: "conversation-1",
  type: "GROUP",
  name: "Design crew",
  directKey: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  members: [],
};

const message: Message = {
  id: "message-1",
  conversationId: conversation.id,
  senderId: "current-user",
  content: "Hello crew",
  idempotencyKey: "key-1",
  status: "READ",
  createdAt: "2026-01-01T10:30:00.000Z",
  editedAt: null,
  deletedAt: null,
};

describe("ConversationPanel", () => {
  it("does not present group status as a per-member receipt", () => {
    render(
      <ConversationPanel
        conversation={conversation}
        currentUserId="current-user"
        messages={[message]}
        loading={false}
        onBack={vi.fn()}
      />,
    );
    expect(screen.getByText("Hello crew")).toBeVisible();
    expect(screen.queryByText(/· read/)).toBeNull();
  });

  it("trims and sends a message with Enter", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    render(
      <ConversationPanel
        conversation={{ ...conversation, type: "DIRECT", name: null }}
        currentUserId="current-user"
        messages={[]}
        loading={false}
        onBack={vi.fn()}
        onSend={onSend}
      />,
    );
    const composer = screen.getByRole("textbox", { name: "Message" });
    await userEvent.type(composer, "  Hello there  {enter}");
    expect(onSend).toHaveBeenCalledWith("Hello there");
    expect(composer).toHaveValue("");
  });

  it("announces message loading", () => {
    render(
      <ConversationPanel
        conversation={conversation}
        currentUserId="current-user"
        messages={[]}
        loading
        onBack={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("status", { name: "Loading messages" }),
    ).toBeVisible();
  });

  it("keeps retained messages visible when loading an older page fails", () => {
    render(
      <ConversationPanel
        conversation={conversation}
        currentUserId="current-user"
        messages={[message]}
        loading={false}
        hasMore
        olderError="The chat service is temporarily unavailable."
        onBack={vi.fn()}
        onLoadMore={vi.fn()}
      />,
    );
    expect(screen.getByText("Hello crew")).toBeVisible();
    expect(
      screen.getByText(/chat service is temporarily unavailable/i),
    ).toBeVisible();
  });

  it("preserves the visible scroll anchor when older messages are prepended", async () => {
    const olderMessage = {
      ...message,
      id: "message-older",
      content: "An older message",
      createdAt: "2026-01-01T09:30:00.000Z",
    };
    const onLoadMore = vi.fn();
    const { container, rerender } = render(
      <ConversationPanel
        conversation={conversation}
        currentUserId="current-user"
        messages={[message]}
        loading={false}
        hasMore
        onBack={vi.fn()}
        onLoadMore={onLoadMore}
      />,
    );
    const viewport = container.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]',
    );
    expect(viewport).not.toBeNull();
    let scrollHeight = 500;
    Object.defineProperty(viewport!, "scrollHeight", {
      configurable: true,
      get: () => scrollHeight,
    });
    viewport!.scrollTop = 100;

    await userEvent.click(
      screen.getByRole("button", { name: "Load older messages" }),
    );
    expect(onLoadMore).toHaveBeenCalledOnce();
    rerender(
      <ConversationPanel
        conversation={conversation}
        currentUserId="current-user"
        messages={[message]}
        loading={false}
        hasMore
        loadingMore
        onBack={vi.fn()}
        onLoadMore={onLoadMore}
      />,
    );
    scrollHeight = 800;
    rerender(
      <ConversationPanel
        conversation={conversation}
        currentUserId="current-user"
        messages={[olderMessage, message]}
        loading={false}
        hasMore
        onBack={vi.fn()}
        onLoadMore={onLoadMore}
      />,
    );
    expect(viewport!.scrollTop).toBe(400);
  });

  it("shows honest realtime state, typing, and exact failed-message retry", async () => {
    const onRetry = vi.fn();
    render(
      <ConversationPanel
        conversation={{ ...conversation, type: "DIRECT", name: null }}
        currentUserId="current-user"
        messages={[
          {
            ...message,
            clientState: "failed",
            clientError: "Connection lost",
          },
        ]}
        loading={false}
        connectionState="reconnecting"
        typingUserIds={["peer-user"]}
        onBack={vi.fn()}
        onRetrySend={onRetry}
      />,
    );

    expect(screen.getByText("Reconnecting")).toBeVisible();
    expect(screen.getByText(/Live updates paused/)).toBeVisible();
    expect(screen.getByText(/Member peer-user is typing/)).toBeVisible();
    expect(screen.getByText(/· failed/)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledWith(message.idempotencyKey);
  });

  it("publishes typing state and stops it after a successful send", async () => {
    const onTypingChange = vi.fn();
    render(
      <ConversationPanel
        conversation={conversation}
        currentUserId="current-user"
        messages={[]}
        loading={false}
        onBack={vi.fn()}
        onSend={vi.fn().mockResolvedValue(undefined)}
        onTypingChange={onTypingChange}
      />,
    );
    const composer = screen.getByRole("textbox", { name: "Message" });
    await userEvent.type(composer, "Hello");
    expect(onTypingChange).toHaveBeenLastCalledWith(true);
    await userEvent.keyboard("{Enter}");
    expect(onTypingChange).toHaveBeenLastCalledWith(false);
  });
});
