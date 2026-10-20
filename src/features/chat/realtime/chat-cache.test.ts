import type { InfiniteData } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { Message, MessagePage } from "@/features/chat/chat-contract";
import {
  mergeNewestMessagePage,
  updateRealtimeMessageStatus,
  upsertRealtimeMessage,
} from "@/features/chat/realtime/chat-cache";

function message(overrides: Partial<Message> = {}): Message {
  return {
    id: "message-1",
    conversationId: "conversation-1",
    senderId: "user-1",
    content: "Hello",
    idempotencyKey: "key-1",
    status: "SENT",
    createdAt: "2026-01-01T10:00:00.000Z",
    editedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

function data(pages: MessagePage[]): InfiniteData<MessagePage> {
  return { pages, pageParams: pages.map((_, index) => index) };
}

describe("realtime message cache reducers", () => {
  it("upserts a message once across paginated history", () => {
    const current = data([
      { messages: [message()], hasMore: true, nextBefore: "message-1" },
      {
        messages: [message({ id: "duplicate", content: "stale duplicate" })],
        hasMore: false,
        nextBefore: null,
      },
    ]);
    const updated = upsertRealtimeMessage(
      current,
      message({ id: "persisted-id", content: "Authoritative" }),
    );

    expect(updated.pages.flatMap((page) => page.messages)).toEqual([
      message({ id: "persisted-id", content: "Authoritative" }),
    ]);
  });

  it("appends new events to the newest page and updates receipts", () => {
    const incoming = message({ id: "message-2", idempotencyKey: "key-2" });
    const withMessage = upsertRealtimeMessage(
      data([{ messages: [message()], hasMore: false, nextBefore: null }]),
      incoming,
    );
    const delivered = updateRealtimeMessageStatus(withMessage, {
      messageId: incoming.id,
      conversationId: incoming.conversationId,
      senderId: incoming.senderId,
      status: "DELIVERED",
    });

    expect(delivered?.pages[0].messages).toHaveLength(2);
    expect(delivered?.pages[0].messages[1].status).toBe("DELIVERED");
  });

  it("does not regress receipts or overwrite a newer edit with stale events", () => {
    const edited = message({
      content: "Latest edit",
      status: "READ",
      editedAt: "2026-01-01T10:05:00.000Z",
    });
    const current = data([
      { messages: [edited], hasMore: false, nextBefore: null },
    ]);
    const staleMessage = message({ content: "Original", status: "SENT" });
    const reconciled = upsertRealtimeMessage(current, staleMessage);
    const regressed = updateRealtimeMessageStatus(reconciled, {
      messageId: edited.id,
      conversationId: edited.conversationId,
      senderId: edited.senderId,
      status: "DELIVERED",
    });

    expect(regressed?.pages[0].messages[0]).toMatchObject({
      content: "Latest edit",
      status: "READ",
      editedAt: edited.editedAt,
    });
  });

  it("reconciles the newest page after reconnect without losing older pages", () => {
    const older = message({ id: "older", idempotencyKey: "older-key" });
    const current = data([
      { messages: [message()], hasMore: true, nextBefore: message().id },
      { messages: [older], hasMore: false, nextBefore: null },
    ]);
    const newest = message({ id: "newest", idempotencyKey: "newest-key" });
    const merged = mergeNewestMessagePage(current, {
      messages: [older, message(), newest],
      hasMore: true,
      nextBefore: older.id,
    });

    expect(merged.pages[0].messages.map((item) => item.id)).toEqual([
      "message-1",
      "newest",
    ]);
    expect(merged.pages[1].messages).toEqual([older]);
  });

  it("preserves socket events that win a race with a stale reconnect snapshot", () => {
    const edited = message({
      content: "Realtime edit",
      status: "READ",
      editedAt: "2026-01-01T10:05:00.000Z",
    });
    const socketOnly = message({
      id: "socket-only",
      idempotencyKey: "socket-only-key",
      content: "Arrived while refetching",
      createdAt: "2026-01-01T10:06:00.000Z",
    });
    const current = data([
      {
        messages: [edited, socketOnly],
        hasMore: false,
        nextBefore: null,
      },
    ]);
    const staleSnapshot: MessagePage = {
      messages: [message({ content: "Original", status: "SENT" })],
      hasMore: false,
      nextBefore: null,
    };

    const merged = mergeNewestMessagePage(current, staleSnapshot);

    expect(merged.pages[0].messages).toEqual([edited, socketOnly]);
  });
});
