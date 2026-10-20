"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { AuthSession } from "@/features/auth/auth-contract";
import {
  chatKeys,
  createConversation,
  getConversations,
  getMessages,
} from "@/features/chat/chat-api";
import type {
  Conversation,
  CreateConversationInput,
} from "@/features/chat/chat-contract";
import { ChatWorkspace } from "@/features/chat/components/chat-workspace";
import { ApiClientError } from "@/lib/api/client";

function errorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : "Something went wrong.";
}

export function ChatController({ session }: { session: AuthSession }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const conversationsQuery = useQuery({
    queryKey: chatKeys.conversations(session.userId),
    queryFn: getConversations,
    staleTime: 15_000,
  });
  const messagesQuery = useInfiniteQuery({
    queryKey: chatKeys.messages(session.userId, activeConversationId ?? "none"),
    queryFn: ({ pageParam }) => getMessages(activeConversationId!, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => (page.hasMore ? page.nextBefore : undefined),
    enabled: Boolean(activeConversationId),
    staleTime: 10_000,
  });
  const createMutation = useMutation({
    mutationFn: createConversation,
    onSuccess: (conversation) => {
      queryClient.setQueryData<Conversation[]>(
        chatKeys.conversations(session.userId),
        (current) => {
          if (!current) return [conversation];
          return current.some((item) => item.id === conversation.id)
            ? current.map((item) =>
                item.id === conversation.id ? conversation : item,
              )
            : [conversation, ...current];
        },
      );
    },
  });
  const messages = useMemo(
    () =>
      (messagesQuery.data?.pages ?? [])
        .slice()
        .reverse()
        .flatMap((page) => page.messages),
    [messagesQuery.data],
  );

  const sessionExpired = [
    conversationsQuery.error,
    messagesQuery.error,
    createMutation.error,
  ].some((reason) => reason instanceof ApiClientError && reason.status === 401);

  useEffect(() => {
    if (!sessionExpired) return;
    queryClient.removeQueries({ queryKey: chatKeys.user(session.userId) });
    router.replace("/login");
  }, [queryClient, router, session.userId, sessionExpired]);

  async function handleCreate(input: CreateConversationInput) {
    const conversation = await createMutation.mutateAsync(input);
    setActiveConversationId(conversation.id);
    return conversation;
  }

  return (
    <ChatWorkspace
      currentUserId={session.userId}
      username={session.username}
      conversations={conversationsQuery.data ?? []}
      conversationsLoading={conversationsQuery.isPending}
      conversationsError={
        conversationsQuery.isError
          ? errorMessage(conversationsQuery.error)
          : null
      }
      messages={messages}
      messagesLoading={Boolean(activeConversationId) && messagesQuery.isPending}
      messagesError={
        messages.length === 0 && messagesQuery.isError
          ? errorMessage(messagesQuery.error)
          : null
      }
      hasOlderMessages={messagesQuery.hasNextPage}
      loadingOlderMessages={messagesQuery.isFetchingNextPage}
      olderMessagesError={
        messages.length > 0 && messagesQuery.isFetchNextPageError
          ? errorMessage(messagesQuery.error)
          : null
      }
      onRetryConversations={() => void conversationsQuery.refetch()}
      onRetryMessages={() => void messagesQuery.refetch()}
      onLoadOlderMessages={() => void messagesQuery.fetchNextPage()}
      onConversationChange={(conversation) =>
        setActiveConversationId(conversation.id)
      }
      onCreateConversation={handleCreate}
    />
  );
}
