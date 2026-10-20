"use client";

import { io, type Socket } from "socket.io-client";
import { ApiClientError, apiJson } from "@/lib/api/client";
import {
  joinedConversationSchema,
  messageSchema,
  messageStatusEventSchema,
  socketExceptionSchema,
  socketTokenSchema,
  typingEventSchema,
  type MessageStatusEvent,
  type RealtimeConnectionState,
  type SendMessagePayload,
  type SocketException,
  type TypingEvent,
} from "@/features/chat/realtime/chat-realtime-contract";
import type { Message } from "@/features/chat/chat-contract";
import { getClientEnv } from "@/lib/env/client";

type ServerToClientEvents = {
  joinedConversation: (payload: unknown) => void;
  newMessage: (payload: unknown) => void;
  messageEdited: (payload: unknown) => void;
  messageDeleted: (payload: unknown) => void;
  messageDelivered: (payload: unknown) => void;
  messageRead: (payload: unknown) => void;
  userTyping: (payload: unknown) => void;
  userStoppedTyping: (payload: unknown) => void;
  exception: (payload: unknown) => void;
};

type ClientToServerEvents = {
  joinConversation: (conversationId: string) => void;
  sendMessage: (
    payload: SendMessagePayload,
    acknowledge: (message: unknown) => void,
  ) => void;
  acknowledgeDelivery: (messageId: string) => void;
  acknowledgeRead: (messageId: string) => void;
  heartbeat: () => void;
  typing: (conversationId: string) => void;
  stopTyping: (conversationId: string) => void;
};

type ChatSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export class RealtimeError extends Error {
  constructor(
    message: string,
    readonly errorCode = "REALTIME_UNAVAILABLE",
  ) {
    super(message);
    this.name = "RealtimeError";
  }
}

export type ChatSocketCallbacks = {
  onStatus: (status: RealtimeConnectionState) => void;
  onMessage: (message: Message, kind: "new" | "edited" | "deleted") => void;
  onMessageStatus: (event: MessageStatusEvent) => void;
  onTyping: (event: TypingEvent, typing: boolean) => void;
  onException: (exception: SocketException) => void;
  onReconnect: () => void;
  onSessionExpired: () => void;
};

type PendingSend = {
  reject: (reason: RealtimeError) => void;
};

const HEARTBEAT_MS = 20_000;
const SEND_TIMEOUT_MS = 12_000;
const MAX_RECONNECT_DELAY_MS = 10_000;

async function getAccessToken() {
  return (
    await apiJson("/api/auth/socket-token", socketTokenSchema, {
      cache: "no-store",
    })
  ).accessToken;
}

export class ChatSocketManager {
  private socket: ChatSocket | null = null;
  private activeConversationId: string | null = null;
  private reconnectTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private reconnectAttempt = 0;
  private stopped = true;
  private connecting = false;
  private hasConnected = false;
  private pendingSends = new Set<PendingSend>();

  constructor(private readonly callbacks: ChatSocketCallbacks) {}

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.callbacks.onStatus("connecting");
    void this.connectWithFreshToken();
  }

  stop() {
    this.stopped = true;
    this.connecting = false;
    this.clearReconnectTimer();
    this.stopHeartbeat();
    this.rejectPendingSends(
      new RealtimeError("The live connection was closed."),
    );
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
    this.callbacks.onStatus("offline");
  }

  setActiveConversation(conversationId: string | null) {
    this.activeConversationId = conversationId;
    if (conversationId && this.socket?.connected) {
      this.socket.emit("joinConversation", conversationId);
    }
  }

  sendMessage(payload: SendMessagePayload) {
    const socket = this.socket;
    if (!socket?.connected) {
      return Promise.reject(
        new RealtimeError(
          "No live connection. Reconnect, then retry this message.",
        ),
      );
    }

    return new Promise<Message>((resolve, reject) => {
      const pending: PendingSend = { reject };
      this.pendingSends.add(pending);
      socket
        .timeout(SEND_TIMEOUT_MS)
        .emit(
          "sendMessage",
          payload,
          (error: Error | null, candidate: unknown) => {
            if (!this.pendingSends.delete(pending)) return;
            if (error) {
              reject(
                new RealtimeError(
                  "The message was not acknowledged. You can retry it safely.",
                  "ACK_TIMEOUT",
                ),
              );
              return;
            }
            const parsed = messageSchema.safeParse(candidate);
            if (!parsed.success) {
              reject(
                new RealtimeError(
                  "The server returned an invalid message acknowledgement.",
                  "INVALID_ACK",
                ),
              );
              return;
            }
            resolve(parsed.data);
          },
        );
    });
  }

  acknowledgeDelivery(messageId: string) {
    if (this.socket?.connected) {
      this.socket.emit("acknowledgeDelivery", messageId);
    }
  }

  acknowledgeRead(messageId: string) {
    if (this.socket?.connected) {
      this.socket.emit("acknowledgeRead", messageId);
    }
  }

  typing(conversationId: string) {
    if (this.socket?.connected) this.socket.emit("typing", conversationId);
  }

  stopTyping(conversationId: string) {
    if (this.socket?.connected) this.socket.emit("stopTyping", conversationId);
  }

  private async connectWithFreshToken() {
    if (this.stopped || this.connecting || this.socket?.connected) return;
    this.connecting = true;
    try {
      const token = await getAccessToken();
      if (this.stopped) return;
      this.disposeSocket();
      this.socket = io(getClientEnv().NEXT_PUBLIC_SOCKET_URL, {
        auth: { token },
        autoConnect: false,
        reconnection: false,
        transports: ["websocket", "polling"],
      });
      this.bindSocket(this.socket);
      this.socket.connect();
    } catch (reason) {
      if (this.stopped) return;
      if (reason instanceof ApiClientError && reason.status === 401) {
        this.callbacks.onSessionExpired();
        this.callbacks.onStatus("offline");
        this.stopped = true;
        return;
      }
      this.callbacks.onStatus("reconnecting");
      this.scheduleReconnect();
    } finally {
      this.connecting = false;
    }
  }

  private bindSocket(socket: ChatSocket) {
    socket.on("connect", () => {
      if (this.stopped) return;
      const reconnected = this.hasConnected;
      this.hasConnected = true;
      this.reconnectAttempt = 0;
      this.clearReconnectTimer();
      this.callbacks.onStatus("connected");
      this.startHeartbeat();
      if (this.activeConversationId) {
        socket.emit("joinConversation", this.activeConversationId);
      }
      if (reconnected) this.callbacks.onReconnect();
    });

    socket.on("disconnect", () => {
      if (this.stopped) return;
      this.stopHeartbeat();
      this.rejectPendingSends(
        new RealtimeError(
          "The connection dropped before the message was acknowledged.",
          "CONNECTION_LOST",
        ),
      );
      this.callbacks.onStatus("reconnecting");
      this.scheduleReconnect();
    });

    socket.on("connect_error", () => {
      if (this.stopped) return;
      this.callbacks.onStatus("reconnecting");
      this.scheduleReconnect();
    });

    const acceptMessage = (
      candidate: unknown,
      kind: "new" | "edited" | "deleted",
    ) => {
      const parsed = messageSchema.safeParse(candidate);
      if (parsed.success) this.callbacks.onMessage(parsed.data, kind);
    };
    socket.on("newMessage", (candidate) => acceptMessage(candidate, "new"));
    socket.on("messageEdited", (candidate) =>
      acceptMessage(candidate, "edited"),
    );
    socket.on("messageDeleted", (candidate) =>
      acceptMessage(candidate, "deleted"),
    );

    const acceptStatus = (candidate: unknown) => {
      const parsed = messageStatusEventSchema.safeParse(candidate);
      if (parsed.success) this.callbacks.onMessageStatus(parsed.data);
    };
    socket.on("messageDelivered", acceptStatus);
    socket.on("messageRead", acceptStatus);

    socket.on("userTyping", (candidate) => {
      const parsed = typingEventSchema.safeParse(candidate);
      if (parsed.success) this.callbacks.onTyping(parsed.data, true);
    });
    socket.on("userStoppedTyping", (candidate) => {
      const parsed = typingEventSchema.safeParse(candidate);
      if (parsed.success) this.callbacks.onTyping(parsed.data, false);
    });
    socket.on("exception", (candidate) => {
      const parsed = socketExceptionSchema.safeParse(candidate);
      if (!parsed.success) return;
      this.callbacks.onException(parsed.data);
      this.rejectPendingSends(
        new RealtimeError(parsed.data.message, parsed.data.errorCode),
      );
    });
    socket.on("joinedConversation", (candidate) => {
      joinedConversationSchema.safeParse(candidate);
    });
  }

  private scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) return;
    const delay = Math.min(
      1_000 * 2 ** Math.min(this.reconnectAttempt, 4),
      MAX_RECONNECT_DELAY_MS,
    );
    this.reconnectAttempt += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      void this.connectWithFreshToken();
    }, delay);
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = window.setInterval(() => {
      if (this.socket?.connected) this.socket.emit("heartbeat");
    }, HEARTBEAT_MS);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) window.clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private rejectPendingSends(reason: RealtimeError) {
    for (const pending of this.pendingSends) pending.reject(reason);
    this.pendingSends.clear();
  }

  private disposeSocket() {
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
  }
}
