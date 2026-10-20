import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { Conversation } from "@/features/chat/chat-contract";
import { ChatWorkspace } from "./chat-workspace";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function renderWorkspace(ui: React.ReactNode) {
  return render(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

const conversation: Conversation = {
  id: "conversation-1",
  type: "GROUP",
  name: "Design crew",
  directKey: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  members: [
    {
      id: "m1",
      conversationId: "conversation-1",
      userId: "current-user",
      role: "ADMIN",
      joinedAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "m2",
      conversationId: "conversation-1",
      userId: "peer-user",
      role: "MEMBER",
      joinedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
};

const secondConversation: Conversation = {
  ...conversation,
  id: "conversation-2",
  name: "Engineering crew",
  members: conversation.members.map((member) => ({
    ...member,
    id: `${member.id}-second`,
    conversationId: "conversation-2",
  })),
};

describe("ChatWorkspace", () => {
  it("renders an honest empty state", () => {
    renderWorkspace(
      <ChatWorkspace
        currentUserId="current-user"
        username="mithun"
        conversations={[]}
      />,
    );
    expect(screen.getByText("No conversations yet")).toBeVisible();
    expect(screen.getByText(/Conversations will appear here/)).toBeVisible();
  });

  it("opens a conversation and supports mobile back navigation", async () => {
    const onChange = vi.fn();
    const onClose = vi.fn();
    renderWorkspace(
      <ChatWorkspace
        currentUserId="current-user"
        username="mithun"
        conversations={[conversation]}
        onConversationChange={onChange}
        onConversationClose={onClose}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Design crew/ }));
    expect(screen.getByRole("heading", { name: "Design crew" })).toBeVisible();
    expect(screen.getByText("No messages yet")).toBeVisible();
    expect(onChange).toHaveBeenCalledWith(conversation);

    await userEvent.click(
      screen.getByRole("button", { name: "Back to conversations" }),
    );
    expect(screen.getByRole("heading", { name: "Messages" })).toBeVisible();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("filters loaded conversations without fabricating results", async () => {
    renderWorkspace(
      <ChatWorkspace
        currentUserId="current-user"
        username="mithun"
        conversations={[conversation, secondConversation]}
      />,
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "Search conversations" }),
      "Engineering",
    );
    expect(
      screen.getByRole("button", { name: /Engineering crew/ }),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: /Design crew/ })).toBeNull();
  });

  it("resets a draft when the active conversation changes", async () => {
    renderWorkspace(
      <ChatWorkspace
        currentUserId="current-user"
        username="mithun"
        conversations={[conversation, secondConversation]}
        onSendMessage={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Design crew/ }));
    await userEvent.type(
      screen.getByRole("textbox", { name: "Message" }),
      "Draft for A",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Engineering crew/ }),
    );
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("");
  });

  it("exposes retry and loading feedback", async () => {
    const retry = vi.fn();
    const { rerender } = renderWorkspace(
      <ChatWorkspace
        currentUserId="current-user"
        username="mithun"
        conversations={[]}
        conversationsError="Service unavailable"
        onRetryConversations={retry}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();

    rerender(
      <ChatWorkspace
        currentUserId="current-user"
        username="mithun"
        conversations={[]}
        conversationsLoading
      />,
    );
    expect(
      screen.getByRole("status", { name: "Loading conversations" }),
    ).toBeVisible();
  });
});
