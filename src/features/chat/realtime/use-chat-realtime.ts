"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import type { AuthSession } from "@/features/auth/auth-contract";
import { chatKeys, getMessages } from "@/features/chat/chat-api";
import type {
  Conversation,
  Message,
  MessagePage,
} from "@/features/chat/chat-contract";
import {
  mergeNewestMessagePage,
  updateRealtimeMessageStatus,
  upsertRealtimeMessage,
} from "@/features/chat/realtime/chat-cache";
import type {
  ClientMessage,
  RealtimeConnectionState,
  SendMessagePayload,
  TypingEvent,
} from "@/features/chat/realtime/chat-realtime-contract";
import {
  ChatSocketManager,
  RealtimeError,
} from "@/features/chat/realtime/chat-socket";

type OutboxMessage = ClientMessage & {
  clientState: "sending" | "failed";
};

const TYPING_IDLE_MS = 2_000;
const REMOTE_TYPING_EXPIRY_MS = 5_000;

function failureMessage(reason: unknown) {
  return reason instanceof RealtimeError
    ? reason.message
    : "The message could not be sent. You can retry it safely.";
}

export function useChatRealtime({
  session,
  conversations,
  activeConversationId,
  messages,
}: {
  session: AuthSession;
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Message[];
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const managerRef = useRef<ChatSocketManager | null>(null);
  const conversationsRef = useRef(conversations);
  const activeConversationRef = useRef(activeConversationId);
  const previousActiveConversationRef = useRef<string | null>(null);
  const pendingReceiptMessagesRef = useRef(new Map<string, Message>());
  const outgoingTypingRef = useRef(new Set<string>());
  const outgoingTypingTimersRef = useRef(new Map<string, number>());
  const remoteTypingTimersRef = useRef(new Map<string, number>());
  const deliveryAcknowledgementsRef = useRef(new Set<string>());
  const readAcknowledgementsRef = useRef(new Set<string>());
  const [connectionState, setConnectionState] =
    useState<RealtimeConnectionState>("connecting");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [outbox, setOutbox] = useState<OutboxMessage[]>([]);
  const [typingByConversation, setTypingByConversation] = useState<
    Record<string, string[]>
  >({});
  const [documentVisible, setDocumentVisible] = useState(false);

  useEffect(() => {
    const updateVisibility = () =>
      setDocumentVisible(document.visibilityState === "visible");
    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);
    return () =>
      document.removeEventListener("visibilitychange", updateVisibility);
  }, []);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    activeConversationRef.current = activeConversationId;
  }, [activeConversationId]);

  const acknowledgeIncomingDirect = useCallback((message: Message) => {
    const conversation = conversationsRef.current.find(
      (candidate) => candidate.id === message.conversationId,
    );
    if (!conversation) {
      pendingReceiptMessagesRef.current.set(message.id, message);
      return;
    }
    if (conversation.type !== "DIRECT") return;
    deliveryAcknowledgementsRef.current.add(message.id);
    managerRef.current?.acknowledgeDelivery(message.id);
    if (
      activeConversationRef.current === message.conversationId &&
      document.visibilityState === "visible"
    ) {
      readAcknowledgementsRef.current.add(message.id);
      managerRef.current?.acknowledgeRead(message.id);
    }
  }, []);

  useEffect(() => {
    for (const [messageId, message] of pendingReceiptMessagesRef.current) {
      const conversation = conversations.find(
        (candidate) => candidate.id === message.conversationId,
      );
      if (!conversation) continue;
      pendingReceiptMessagesRef.current.delete(messageId);
      if (conversation.type === "DIRECT") acknowledgeIncomingDirect(message);
    }
  }, [acknowledgeIncomingDirect, conversations]);

  const applyMessage = useCallback(
    (message: Message) => {
      const queryKey = chatKeys.messages(
        session.userId,
        message.conversationId,
      );
      const current =
        queryClient.getQueryData<InfiniteData<MessagePage>>(queryKey);
      if (current) {
        queryClient.setQueryData<InfiniteData<MessagePage>>(
          queryKey,
          upsertRealtimeMessage(current, message),
        );
      } else {
        queryClient.setQueryData<InfiniteData<MessagePage>>(
          queryKey,
          upsertRealtimeMessage(undefined, message),
        );
        void queryClient.invalidateQueries({ queryKey });
      }
      setOutbox((current) =>
        current.filter(
          (candidate) => candidate.idempotencyKey !== message.idempotencyKey,
        ),
      );
    },
    [queryClient, session.userId],
  );

  const updateRemoteTyping = useCallback(
    (event: TypingEvent, typing: boolean) => {
      const key = `${event.conversationId}:${event.userId}`;
      const existingTimer = remoteTypingTimersRef.current.get(key);
      if (existingTimer) window.clearTimeout(existingTimer);
      remoteTypingTimersRef.current.delete(key);

      setTypingByConversation((current) => {
        const currentUsers = current[event.conversationId] ?? [];
        const nextUsers = typing
          ? Array.from(new Set([...currentUsers, event.userId]))
          : currentUsers.filter((userId) => userId !== event.userId);
        const next = { ...current };
        if (nextUsers.length) next[event.conversationId] = nextUsers;
        else delete next[event.conversationId];
        return next;
      });

      if (typing) {
        remoteTypingTimersRef.current.set(
          key,
          window.setTimeout(() => {
            remoteTypingTimersRef.current.delete(key);
            setTypingByConversation((current) => {
              const nextUsers = (current[event.conversationId] ?? []).filter(
                (userId) => userId !== event.userId,
              );
              const next = { ...current };
              if (nextUsers.length) next[event.conversationId] = nextUsers;
              else delete next[event.conversationId];
              return next;
            });
          }, REMOTE_TYPING_EXPIRY_MS),
        );
      }
    },
    [],
  );

  useEffect(() => {
    const outgoingTypingTimers = outgoingTypingTimersRef.current;
    const remoteTypingTimers = remoteTypingTimersRef.current;
    const manager = new ChatSocketManager({
      onStatus: (status) => {
        setConnectionState(status);
        if (status === "connected") setConnectionError(null);
        else {
          deliveryAcknowledgementsRef.current.clear();
          readAcknowledgementsRef.current.clear();
        }
      },
      onMessage: (message, kind) => {
        applyMessage(message);
        if (kind !== "new" || message.senderId === session.userId) return;
        acknowledgeIncomingDirect(message);
      },
      onMessageStatus: (event) => {
        queryClient.setQueryData<InfiniteData<MessagePage>>(
          chatKeys.messages(session.userId, event.conversationId),
          (current) => updateRealtimeMessageStatus(current, event),
        );
      },
      onTyping: updateRemoteTyping,
      onException: (exception) => setConnectionError(exception.message),
      onReconnect: () => {
        deliveryAcknowledgementsRef.current.clear();
        readAcknowledgementsRef.current.clear();
        const conversationId = activeConversationRef.current;
        if (!conversationId) return;
        void getMessages(conversationId)
          .then((newestPage) => {
            const persistedKeys = new Set(
              newestPage.messages.map((message) => message.idempotencyKey),
            );
            setOutbox((current) =>
              current.filter(
                (message) => !persistedKeys.has(message.idempotencyKey),
              ),
            );
            queryClient.setQueryData<InfiniteData<MessagePage>>(
              chatKeys.messages(session.userId, conversationId),
              (current) => mergeNewestMessagePage(current, newestPage),
            );
          })
          .catch(() => {
            void queryClient.invalidateQueries({
              queryKey: chatKeys.messages(session.userId, conversationId),
            });
          });
      },
      onSessionExpired: () => {
        queryClient.removeQueries({ queryKey: chatKeys.user(session.userId) });
        router.replace("/login");
      },
    });
    managerRef.current = manager;
    manager.start();

    return () => {
      manager.stop();
      managerRef.current = null;
      for (const timer of outgoingTypingTimers.values())
        window.clearTimeout(timer);
      for (const timer of remoteTypingTimers.values())
        window.clearTimeout(timer);
      outgoingTypingTimers.clear();
      remoteTypingTimers.clear();
    };
  }, [
    acknowledgeIncomingDirect,
    applyMessage,
    queryClient,
    router,
    session.userId,
    updateRemoteTyping,
  ]);

  useEffect(() => {
    if (connectionState !== "connected") return;

    for (const conversation of conversations) {
      if (conversation.type !== "DIRECT") continue;
      const data = queryClient.getQueryData<InfiniteData<MessagePage>>(
        chatKeys.messages(session.userId, conversation.id),
      );
      for (const message of data?.pages.flatMap((page) => page.messages) ??
        []) {
        if (message.senderId === session.userId || message.status === "READ") {
          continue;
        }
        const shouldRead =
          documentVisible && conversation.id === activeConversationId;
        if (shouldRead) {
          if (readAcknowledgementsRef.current.has(message.id)) continue;
          readAcknowledgementsRef.current.add(message.id);
          managerRef.current?.acknowledgeRead(message.id);
        } else if (
          message.status === "SENT" &&
          !deliveryAcknowledgementsRef.current.has(message.id)
        ) {
          deliveryAcknowledgementsRef.current.add(message.id);
          managerRef.current?.acknowledgeDelivery(message.id);
        }
      }
    }
  }, [
    activeConversationId,
    connectionState,
    conversations,
    documentVisible,
    messages,
    queryClient,
    session.userId,
  ]);

  useEffect(() => {
    const previousConversationId = previousActiveConversationRef.current;
    if (
      previousConversationId &&
      previousConversationId !== activeConversationId
    ) {
      const timer = outgoingTypingTimersRef.current.get(previousConversationId);
      if (timer) window.clearTimeout(timer);
      outgoingTypingTimersRef.current.delete(previousConversationId);
      if (outgoingTypingRef.current.delete(previousConversationId)) {
        managerRef.current?.stopTyping(previousConversationId);
      }
    }
    previousActiveConversationRef.current = activeConversationId;
    managerRef.current?.setActiveConversation(activeConversationId);
  }, [activeConversationId]);

  const attemptSend = useCallback(
    async (payload: SendMessagePayload) => {
      setOutbox((current) =>
        current.map((message) =>
          message.idempotencyKey === payload.idempotencyKey
            ? { ...message, clientState: "sending", clientError: undefined }
            : message,
        ),
      );
      const manager = managerRef.current;
      if (!manager) {
        setOutbox((current) =>
          current.map((message) =>
            message.idempotencyKey === payload.idempotencyKey
              ? {
                  ...message,
                  clientState: "failed",
                  clientError:
                    "The live connection is not ready. Try this message again.",
                }
              : message,
          ),
        );
        return;
      }
      try {
        applyMessage(await manager.sendMessage(payload));
      } catch (reason) {
        setOutbox((current) =>
          current.map((message) =>
            message.idempotencyKey === payload.idempotencyKey
              ? {
                  ...message,
                  clientState: "failed",
                  clientError: failureMessage(reason),
                }
              : message,
          ),
        );
      }
    },
    [applyMessage],
  );

  const sendMessage = useCallback(
    async (conversationId: string, content: string) => {
      const idempotencyKey = crypto.randomUUID();
      const message: OutboxMessage = {
        id: `pending-${idempotencyKey}`,
        conversationId,
        senderId: session.userId,
        content,
        idempotencyKey,
        status: "SENT",
        createdAt: new Date().toISOString(),
        editedAt: null,
        deletedAt: null,
        clientState: "sending",
      };
      setOutbox((current) => [...current, message]);
      await attemptSend({ conversationId, content, idempotencyKey });
    },
    [attemptSend, session.userId],
  );

  const retryMessage = useCallback(
    (idempotencyKey: string) => {
      const message = outbox.find(
        (candidate) => candidate.idempotencyKey === idempotencyKey,
      );
      if (!message) return;
      void attemptSend({
        conversationId: message.conversationId,
        content: message.content,
        idempotencyKey: message.idempotencyKey,
      });
    },
    [attemptSend, outbox],
  );

  const setTyping = useCallback((conversationId: string, typing: boolean) => {
    const existingTimer = outgoingTypingTimersRef.current.get(conversationId);
    if (existingTimer) window.clearTimeout(existingTimer);
    outgoingTypingTimersRef.current.delete(conversationId);

    if (!typing) {
      if (outgoingTypingRef.current.delete(conversationId)) {
        managerRef.current?.stopTyping(conversationId);
      }
      return;
    }

    if (!outgoingTypingRef.current.has(conversationId)) {
      outgoingTypingRef.current.add(conversationId);
      managerRef.current?.typing(conversationId);
    }
    outgoingTypingTimersRef.current.set(
      conversationId,
      window.setTimeout(() => {
        outgoingTypingTimersRef.current.delete(conversationId);
        if (outgoingTypingRef.current.delete(conversationId)) {
          managerRef.current?.stopTyping(conversationId);
        }
      }, TYPING_IDLE_MS),
    );
  }, []);

  return {
    connectionState,
    connectionError,
    outbox,
    typingUserIds: activeConversationId
      ? (typingByConversation[activeConversationId] ?? [])
      : [],
    sendMessage,
    retryMessage,
    setTyping,
  };
}
