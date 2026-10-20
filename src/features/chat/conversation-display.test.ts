import { describe, expect, it } from "vitest";
import type { Conversation } from "./chat-contract";
import {
  conversationDescription,
  conversationTitle,
  shortUserId,
} from "./conversation-display";

const baseConversation: Conversation = {
  id: "conversation-1",
  type: "DIRECT",
  name: null,
  directKey: "a:b",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  members: [
    {
      id: "member-1",
      conversationId: "conversation-1",
      userId: "current-user",
      role: "MEMBER",
      joinedAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "member-2",
      conversationId: "conversation-1",
      userId: "12345678-1234-1234-1234-123456789abc",
      role: "MEMBER",
      joinedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
};

describe("conversation display", () => {
  it("uses a shortened peer ID for direct chats", () => {
    expect(conversationTitle(baseConversation, "current-user")).toBe(
      "Member 123456…9abc",
    );
  });

  it("uses supported group metadata", () => {
    const group: Conversation = {
      ...baseConversation,
      type: "GROUP",
      name: "Design crew",
      directKey: null,
    };
    expect(conversationTitle(group, "current-user")).toBe("Design crew");
    expect(conversationDescription(group)).toBe("2 members");
  });

  it("does not over-truncate short IDs", () => {
    expect(shortUserId("member-7")).toBe("member-7");
  });
});
