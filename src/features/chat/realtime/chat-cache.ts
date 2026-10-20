import type { InfiniteData } from "@tanstack/react-query";
import type { Message, MessagePage } from "@/features/chat/chat-contract";
import type { MessageStatusEvent } from "@/features/chat/realtime/chat-realtime-contract";

function sameMessage(left: Message, right: Message) {
  return (
    left.id === right.id ||
    (left.senderId === right.senderId &&
      left.idempotencyKey === right.idempotencyKey)
  );
}

const statusRank: Record<Message["status"], number> = {
  SENT: 0,
  DELIVERED: 1,
  READ: 2,
};

function newestMutationTime(message: Message) {
  return new Date(
    message.deletedAt ?? message.editedAt ?? message.createdAt,
  ).getTime();
}

function reconcileMessage(current: Message, incoming: Message): Message {
  const status =
    statusRank[current.status] > statusRank[incoming.status]
      ? current.status
      : incoming.status;
  if (current.deletedAt && !incoming.deletedAt) return { ...current, status };
  if (
    (current.deletedAt || current.editedAt) &&
    newestMutationTime(current) > newestMutationTime(incoming)
  ) {
    return { ...current, status };
  }
  return { ...incoming, status };
}

export function upsertRealtimeMessage(
  current: InfiniteData<MessagePage> | undefined,
  message: Message,
): InfiniteData<MessagePage> {
  if (!current?.pages.length) {
    return {
      pages: [{ messages: [message], hasMore: false, nextBefore: null }],
      pageParams: [undefined],
    };
  }

  let replaced = false;
  const pages = current.pages.map((page) => ({
    ...page,
    messages: page.messages.flatMap((candidate) => {
      if (!sameMessage(candidate, message)) return [candidate];
      if (replaced) return [];
      replaced = true;
      return [reconcileMessage(candidate, message)];
    }),
  }));

  if (!replaced) {
    pages[0] = {
      ...pages[0],
      messages: [...pages[0].messages, message],
    };
  }

  return { ...current, pages };
}

export function updateRealtimeMessageStatus(
  current: InfiniteData<MessagePage> | undefined,
  event: MessageStatusEvent,
) {
  if (!current) return current;
  return {
    ...current,
    pages: current.pages.map((page) => ({
      ...page,
      messages: page.messages.map((message) =>
        message.id === event.messageId &&
        statusRank[event.status] > statusRank[message.status]
          ? { ...message, status: event.status }
          : message,
      ),
    })),
  };
}

export function mergeNewestMessagePage(
  current: InfiniteData<MessagePage> | undefined,
  newestPage: MessagePage,
): InfiniteData<MessagePage> {
  if (!current?.pages.length) {
    return { pages: [newestPage], pageParams: [undefined] };
  }

  const olderPages = current.pages.slice(1);
  const olderIds = new Set(
    olderPages.flatMap((page) => page.messages.map((message) => message.id)),
  );
  const mergedMessages = current.pages[0].messages.filter(
    (message) => !olderIds.has(message.id),
  );
  for (const incoming of newestPage.messages) {
    if (olderIds.has(incoming.id)) continue;
    const existingIndex = mergedMessages.findIndex((message) =>
      sameMessage(message, incoming),
    );
    if (existingIndex === -1) mergedMessages.push(incoming);
    else {
      mergedMessages[existingIndex] = reconcileMessage(
        mergedMessages[existingIndex],
        incoming,
      );
    }
  }
  mergedMessages.sort((left, right) => {
    const timeDifference =
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    return timeDifference || left.id.localeCompare(right.id);
  });
  const firstPage = {
    ...newestPage,
    messages: mergedMessages,
  };

  return {
    pages: [firstPage, ...olderPages],
    pageParams: current.pageParams,
  };
}
