import { z } from "zod";
import {
  conversationSchema,
  messagePageSchema,
  type CreateConversationInput,
} from "@/features/chat/chat-contract";
import { apiJson } from "@/lib/api/client";

export const chatKeys = {
  all: ["chat"] as const,
  user: (userId: string) => [...chatKeys.all, userId] as const,
  conversations: (userId: string) =>
    [...chatKeys.user(userId), "conversations"] as const,
  messages: (userId: string, conversationId: string) =>
    [...chatKeys.user(userId), "messages", conversationId] as const,
};

export function getConversations() {
  return apiJson("/api/chat/conversations", z.array(conversationSchema));
}

export function getMessages(conversationId: string, before?: string) {
  const search = new URLSearchParams({ limit: "50" });
  if (before) search.set("before", before);
  return apiJson(
    `/api/chat/conversations/${encodeURIComponent(conversationId)}/messages?${search}`,
    messagePageSchema,
  );
}

export function createConversation(input: CreateConversationInput) {
  const direct = input.type === "DIRECT";
  return apiJson(
    `/api/chat/conversations/${direct ? "direct" : "group"}`,
    conversationSchema,
    {
      method: "POST",
      body: JSON.stringify(
        direct
          ? { recipientId: input.recipientId }
          : { name: input.name, memberIds: input.memberIds },
      ),
    },
  );
}
