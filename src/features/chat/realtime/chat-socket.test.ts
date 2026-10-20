import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "@/features/chat/chat-contract";

const harness = vi.hoisted(() => {
  class FakeSocket {
    connected = false;
    listeners = new Map<string, Set<(...args: never[]) => void>>();
    emitted: Array<{ event: string; args: unknown[] }> = [];

    on(event: string, listener: (...args: never[]) => void) {
      const listeners = this.listeners.get(event) ?? new Set();
      listeners.add(listener);
      this.listeners.set(event, listeners);
      return this;
    }

    trigger(event: string, ...args: unknown[]) {
      if (event === "connect") this.connected = true;
      if (event === "disconnect") this.connected = false;
      for (const listener of this.listeners.get(event) ?? []) {
        listener(...(args as never[]));
      }
    }

    emit(event: string, ...args: unknown[]) {
      this.emitted.push({ event, args });
      return this;
    }

    timeout() {
      return this;
    }

    connect() {
      return this;
    }

    disconnect() {
      this.connected = false;
      return this;
    }

    removeAllListeners() {
      this.listeners.clear();
      return this;
    }
  }

  return {
    apiJson: vi.fn(),
    io: vi.fn(() => new FakeSocket()),
    FakeSocket,
  };
});

vi.mock("socket.io-client", () => ({ io: harness.io }));
vi.mock("@/lib/api/client", () => ({
  ApiClientError: class ApiClientError extends Error {
    constructor(
      message: string,
      readonly status: number,
    ) {
      super(message);
    }
  },
  apiJson: harness.apiJson,
}));

import { ApiClientError } from "@/lib/api/client";
import { ChatSocketManager } from "@/features/chat/realtime/chat-socket";

const message: Message = {
  id: "22222222-2222-4222-8222-222222222222",
  conversationId: "11111111-1111-4111-8111-111111111111",
  senderId: "user-a",
  content: "Hello",
  idempotencyKey: "33333333-3333-4333-8333-333333333333",
  status: "SENT",
  createdAt: "2026-01-01T10:00:00.000Z",
  editedAt: null,
  deletedAt: null,
};

function callbacks() {
  return {
    onStatus: vi.fn(),
    onMessage: vi.fn(),
    onMessageStatus: vi.fn(),
    onTyping: vi.fn(),
    onException: vi.fn(),
    onReconnect: vi.fn(),
    onSessionExpired: vi.fn(),
  };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("ChatSocketManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    harness.apiJson.mockReset().mockResolvedValue({ accessToken: "token-a" });
    harness.io.mockClear();
  });

  afterEach(() => vi.useRealTimers());

  it("maintains one connection, joins the active room, and heartbeats", async () => {
    const events = callbacks();
    const manager = new ChatSocketManager(events);
    manager.setActiveConversation(message.conversationId);
    manager.start();
    await flushPromises();
    const socket = harness.io.mock.results[0].value;
    socket.trigger("connect");

    expect(events.onStatus).toHaveBeenCalledWith("connected");
    expect(socket.emitted).toContainEqual({
      event: "joinConversation",
      args: [message.conversationId],
    });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(socket.emitted).toContainEqual({ event: "heartbeat", args: [] });

    manager.stop();
    expect(events.onStatus).toHaveBeenLastCalledWith("offline");
    expect(socket.listeners.size).toBe(0);
  });

  it("reacquires a token, rejoins, and requests newest history on reconnect", async () => {
    const events = callbacks();
    const manager = new ChatSocketManager(events);
    manager.setActiveConversation(message.conversationId);
    manager.start();
    await flushPromises();
    const firstSocket = harness.io.mock.results[0].value;
    firstSocket.trigger("connect");
    firstSocket.trigger("disconnect", "transport close");

    expect(events.onStatus).toHaveBeenLastCalledWith("reconnecting");
    await vi.advanceTimersByTimeAsync(1_000);
    await flushPromises();
    const secondSocket = harness.io.mock.results[1].value;
    secondSocket.trigger("connect");

    expect(harness.apiJson).toHaveBeenCalledTimes(2);
    expect(secondSocket.emitted).toContainEqual({
      event: "joinConversation",
      args: [message.conversationId],
    });
    expect(events.onReconnect).toHaveBeenCalledOnce();
    manager.stop();
  });

  it("uses the raw send ACK and surfaces gateway exceptions", async () => {
    const events = callbacks();
    const manager = new ChatSocketManager(events);
    manager.start();
    await flushPromises();
    const socket = harness.io.mock.results[0].value;
    socket.trigger("connect");

    const acknowledged = manager.sendMessage({
      conversationId: message.conversationId,
      content: message.content,
      idempotencyKey: message.idempotencyKey,
    });
    const send = socket.emitted.find(
      (entry: { event: string; args: unknown[] }) =>
        entry.event === "sendMessage",
    );
    const acknowledge = send?.args.at(-1) as (
      error: Error | null,
      candidate: Message,
    ) => void;
    acknowledge(null, message);
    await expect(acknowledged).resolves.toEqual(message);

    const rejected = manager.sendMessage({
      conversationId: message.conversationId,
      content: "Second",
      idempotencyKey: "44444444-4444-4444-8444-444444444444",
    });
    socket.trigger("exception", {
      errorCode: "RATE_LIMIT_EXCEEDED",
      message: "Too many messages. Try again later.",
    });
    await expect(rejected).rejects.toMatchObject({
      errorCode: "RATE_LIMIT_EXCEEDED",
    });
    expect(events.onException).toHaveBeenCalledOnce();
    manager.stop();
  });

  it("expires only a rejected session and retries temporary token failures", async () => {
    const expiredEvents = callbacks();
    harness.apiJson.mockRejectedValueOnce(new ApiClientError("Expired", 401));
    const expiredManager = new ChatSocketManager(expiredEvents);
    expiredManager.start();
    await flushPromises();
    expect(expiredEvents.onSessionExpired).toHaveBeenCalledOnce();
    expect(harness.io).not.toHaveBeenCalled();

    const unavailableEvents = callbacks();
    harness.apiJson
      .mockRejectedValueOnce(new ApiClientError("Unavailable", 503))
      .mockResolvedValueOnce({ accessToken: "token-b" });
    const unavailableManager = new ChatSocketManager(unavailableEvents);
    unavailableManager.start();
    await flushPromises();
    expect(unavailableEvents.onSessionExpired).not.toHaveBeenCalled();
    expect(unavailableEvents.onStatus).toHaveBeenLastCalledWith("reconnecting");
    await vi.advanceTimersByTimeAsync(1_000);
    await flushPromises();
    expect(harness.io).toHaveBeenCalledOnce();
    unavailableManager.stop();
  });
});
