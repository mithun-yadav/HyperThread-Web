"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  LoaderCircleIcon,
  MessageCircleMoreIcon,
  RotateCcwIcon,
  SendHorizontalIcon,
  WifiIcon,
  WifiOffIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { Conversation } from "@/features/chat/chat-contract";
import type {
  ClientMessage,
  RealtimeConnectionState,
} from "@/features/chat/realtime/chat-realtime-contract";
import {
  conversationDescription,
  conversationTitle,
  shortUserId,
} from "@/features/chat/conversation-display";

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function connectionLabel(state: RealtimeConnectionState) {
  if (state === "connected") return "Live";
  if (state === "connecting") return "Connecting";
  if (state === "reconnecting") return "Reconnecting";
  return "Offline";
}

export function ConversationPanel({
  conversation,
  currentUserId,
  messages,
  loading,
  error,
  hasMore,
  loadingMore,
  olderError,
  connectionState = "offline",
  connectionError,
  typingUserIds = [],
  onBack,
  onRetry,
  onLoadMore,
  onSend,
  onRetrySend,
  onTypingChange,
}: {
  conversation: Conversation | null;
  currentUserId: string;
  messages: ClientMessage[];
  loading: boolean;
  error?: string | null;
  hasMore?: boolean;
  loadingMore?: boolean;
  olderError?: string | null;
  connectionState?: RealtimeConnectionState;
  connectionError?: string | null;
  typingUserIds?: string[];
  onBack: () => void;
  onRetry?: () => void;
  onLoadMore?: () => void;
  onSend?: (content: string) => Promise<void>;
  onRetrySend?: (idempotencyKey: string) => void;
  onTypingChange?: (typing: boolean) => void;
}) {
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const paginationAnchorRef = useRef<{
    scrollHeight: number;
    scrollTop: number;
  } | null>(null);
  const nearBottomRef = useRef(true);
  const previousNewestIdRef = useRef<string | null>(null);
  const [newMessagesWaiting, setNewMessagesWaiting] = useState(false);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const handleScroll = () => {
      nearBottomRef.current =
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 96;
      if (nearBottomRef.current) setNewMessagesWaiting(false);
    };
    viewport.addEventListener("scroll", handleScroll, { passive: true });
    return () => viewport.removeEventListener("scroll", handleScroll);
  }, [conversation?.id]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const anchor = paginationAnchorRef.current;
    if (!viewport || !anchor || loadingMore) return;
    viewport.scrollTop =
      anchor.scrollTop + (viewport.scrollHeight - anchor.scrollHeight);
    paginationAnchorRef.current = null;
  }, [loadingMore, messages.length]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const newest = messages.at(-1);
    if (!viewport || !newest || paginationAnchorRef.current) return;
    const previousNewestId = previousNewestIdRef.current;
    previousNewestIdRef.current = newest.id;
    if (!previousNewestId || previousNewestId === newest.id) {
      if (!previousNewestId) viewport.scrollTop = viewport.scrollHeight;
      return;
    }
    if (nearBottomRef.current || newest.senderId === currentUserId) {
      viewport.scrollTop = viewport.scrollHeight;
      nearBottomRef.current = true;
      setNewMessagesWaiting(false);
    } else {
      setNewMessagesWaiting(true);
    }
  }, [currentUserId, messages]);

  if (!conversation) {
    return (
      <div className="hidden min-h-0 place-items-center lg:grid">
        <Empty className="max-w-md">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MessageCircleMoreIcon />
            </EmptyMedia>
            <EmptyTitle>Select a conversation</EmptyTitle>
            <EmptyDescription>
              Choose a thread from the left to open its messages.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = content.trim();
    if (!trimmed || !onSend || sending) return;
    setSending(true);
    setContent("");
    onTypingChange?.(false);
    try {
      await onSend(trimmed);
    } finally {
      setSending(false);
    }
  }

  return (
    <section
      className="bg-card flex min-h-0 flex-1 flex-col"
      aria-label={conversationTitle(conversation, currentUserId)}
    >
      <header className="flex h-20 shrink-0 items-center gap-3 border-b px-4 sm:px-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          aria-label="Back to conversations"
          className="lg:hidden"
        >
          <ArrowLeftIcon />
        </Button>
        <div className="min-w-0">
          <h1 className="truncate font-semibold tracking-tight">
            {conversationTitle(conversation, currentUserId)}
          </h1>
          <p className="text-muted-foreground truncate text-xs">
            {typingUserIds.length > 0
              ? typingUserIds.length === 1
                ? `Member ${shortUserId(typingUserIds[0])} is typing…`
                : `${typingUserIds.length} people are typing…`
              : conversationDescription(conversation)}
          </p>
        </div>
        <div
          className="text-muted-foreground ml-auto flex shrink-0 items-center gap-1.5 text-xs"
          role="status"
          aria-live="polite"
          title={connectionError ?? undefined}
        >
          {connectionState === "connected" ? (
            <WifiIcon className="text-primary size-3.5" aria-hidden="true" />
          ) : connectionState === "offline" ? (
            <WifiOffIcon
              className="text-destructive size-3.5"
              aria-hidden="true"
            />
          ) : (
            <LoaderCircleIcon
              className="size-3.5 animate-spin"
              aria-hidden="true"
            />
          )}
          <span className="sr-only sm:not-sr-only">
            {connectionLabel(connectionState)}
          </span>
        </div>
      </header>

      {connectionState !== "connected" && (
        <div className="bg-muted/70 text-muted-foreground border-b px-4 py-2 text-center text-xs">
          {connectionState === "connecting"
            ? "Connecting to live messages…"
            : connectionState === "reconnecting"
              ? "Live updates paused. Reconnecting…"
              : "Offline. You can retry failed messages when the connection returns."}
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        <ScrollArea className="h-full" viewportRef={viewportRef}>
          {loading ? (
            <div
              className="mx-auto flex max-w-3xl flex-col gap-5 px-5 py-8"
              aria-label="Loading messages"
              role="status"
              aria-live="polite"
            >
              <span className="sr-only">Loading messages</span>
              <Skeleton className="h-16 w-3/5 rounded-2xl" />
              <Skeleton className="ml-auto h-20 w-2/3 rounded-2xl" />
              <Skeleton className="h-14 w-1/2 rounded-2xl" />
            </div>
          ) : error ? (
            <div className="grid min-h-[55vh] place-items-center px-6 text-center">
              <div>
                <p className="font-medium">Couldn&apos;t load messages</p>
                <p className="text-muted-foreground mt-1 text-sm">{error}</p>
                {onRetry && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={onRetry}
                  >
                    Try again
                  </Button>
                )}
              </div>
            </div>
          ) : messages.length === 0 ? (
            <div className="grid min-h-[55vh] place-items-center px-6 text-center">
              <div>
                <p className="font-medium">No messages yet</p>
                <p className="text-muted-foreground mt-1 text-sm">
                  Send the first message to begin this thread.
                </p>
              </div>
            </div>
          ) : (
            <ol className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-7 sm:px-8">
              {hasMore && onLoadMore && (
                <li className="mb-2 space-y-2 text-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const viewport = viewportRef.current;
                      if (viewport) {
                        paginationAnchorRef.current = {
                          scrollHeight: viewport.scrollHeight,
                          scrollTop: viewport.scrollTop,
                        };
                      }
                      onLoadMore();
                    }}
                    disabled={loadingMore}
                  >
                    {loadingMore ? "Loading…" : "Load older messages"}
                  </Button>
                  {olderError && (
                    <p
                      className="text-destructive text-xs"
                      role="status"
                      aria-live="polite"
                    >
                      {olderError} Try again.
                    </p>
                  )}
                </li>
              )}
              {messages.map((message) => {
                const own = message.senderId === currentUserId;
                return (
                  <li
                    key={message.id}
                    className={
                      own ? "ml-auto max-w-[82%]" : "mr-auto max-w-[82%]"
                    }
                  >
                    {!own && (
                      <p className="text-muted-foreground mb-1 px-1 text-[0.7rem]">
                        Member {shortUserId(message.senderId)}
                      </p>
                    )}
                    <div
                      className={
                        own
                          ? "bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-2.5"
                          : "bg-muted rounded-2xl rounded-bl-md px-4 py-2.5"
                      }
                    >
                      <p
                        className={
                          message.deletedAt
                            ? "text-sm italic opacity-70"
                            : "text-sm leading-6 whitespace-pre-wrap"
                        }
                      >
                        {message.deletedAt
                          ? "Message deleted"
                          : message.content}
                      </p>
                      <p
                        className={
                          own
                            ? "text-primary-foreground mt-1 text-right text-[0.65rem]"
                            : "text-muted-foreground mt-1 text-right text-[0.65rem]"
                        }
                      >
                        {formatTime(message.createdAt)}
                        {message.editedAt ? " · edited" : ""}
                        {own
                          ? message.clientState === "sending"
                            ? " · sending…"
                            : message.clientState === "failed"
                              ? " · failed"
                              : conversation.type === "DIRECT"
                                ? ` · ${message.status.toLowerCase()}`
                                : ""
                          : ""}
                      </p>
                      {message.clientState === "failed" && onRetrySend && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground mt-1 ml-auto flex"
                          onClick={() => onRetrySend(message.idempotencyKey)}
                          title={message.clientError}
                        >
                          <RotateCcwIcon /> Retry
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </ScrollArea>
        {newMessagesWaiting && (
          <Button
            type="button"
            size="sm"
            className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full shadow-lg"
            onClick={() => {
              const viewport = viewportRef.current;
              if (viewport) viewport.scrollTop = viewport.scrollHeight;
              nearBottomRef.current = true;
              setNewMessagesWaiting(false);
            }}
          >
            <ArrowDownIcon /> New messages
          </Button>
        )}
      </div>

      {onSend && (
        <form onSubmit={submit} className="border-t p-3 sm:p-5">
          <div className="bg-muted/70 mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border p-2 shadow-sm">
            <Textarea
              value={content}
              onChange={(event) => {
                setContent(event.target.value);
                onTypingChange?.(Boolean(event.target.value.trim()));
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="Write a message"
              aria-label="Message"
              rows={1}
              maxLength={4000}
              className="max-h-36 min-h-10 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
            />
            <Button
              type="submit"
              size="icon-lg"
              disabled={!content.trim() || sending}
              aria-label="Send message"
              className="rounded-xl"
            >
              <SendHorizontalIcon />
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
