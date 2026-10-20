"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircleIcon } from "lucide-react";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import type {
  Conversation,
  CreateConversationInput,
} from "@/features/chat/chat-contract";
import type {
  ClientMessage,
  RealtimeConnectionState,
} from "@/features/chat/realtime/chat-realtime-contract";
import { ConversationList } from "@/features/chat/components/conversation-list";
import { ConversationPanel } from "@/features/chat/components/conversation-panel";
import { CreateConversationDialog } from "@/features/chat/components/create-conversation-dialog";

export type ChatWorkspaceProps = {
  currentUserId: string;
  username: string;
  conversations: Conversation[];
  conversationsLoading?: boolean;
  conversationsError?: string | null;
  messages?: ClientMessage[];
  messagesLoading?: boolean;
  messagesError?: string | null;
  hasOlderMessages?: boolean;
  loadingOlderMessages?: boolean;
  olderMessagesError?: string | null;
  onRetryConversations?: () => void;
  onRetryMessages?: () => void;
  onLoadOlderMessages?: () => void;
  onConversationChange?: (conversation: Conversation) => void;
  onConversationClose?: () => void;
  onCreateConversation?: (
    input: CreateConversationInput,
  ) => Promise<Conversation>;
  onSendMessage?: (conversationId: string, content: string) => Promise<void>;
  onRetrySendMessage?: (idempotencyKey: string) => void;
  onTypingChange?: (typing: boolean) => void;
  connectionState?: RealtimeConnectionState;
  connectionError?: string | null;
  typingUserIds?: string[];
};

export function ChatWorkspace({
  currentUserId,
  username,
  conversations,
  conversationsLoading = false,
  conversationsError = null,
  messages = [],
  messagesLoading = false,
  messagesError = null,
  hasOlderMessages = false,
  loadingOlderMessages = false,
  olderMessagesError = null,
  onRetryConversations,
  onRetryMessages,
  onLoadOlderMessages,
  onConversationChange,
  onConversationClose,
  onCreateConversation,
  onSendMessage,
  onRetrySendMessage,
  onTypingChange,
  connectionState = "offline",
  connectionError = null,
  typingUserIds = [],
}: ChatWorkspaceProps) {
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const focusOnReturnIdRef = useRef<string | null>(null);
  const activeConversation = useMemo(
    () =>
      conversations.find((conversation) => conversation.id === activeId) ??
      null,
    [activeId, conversations],
  );

  useEffect(() => {
    const conversationId = focusOnReturnIdRef.current;
    if (activeId || !conversationId) return;
    const frame = window.requestAnimationFrame(() => {
      const rows = document.querySelectorAll<HTMLButtonElement>(
        "[data-conversation-id]",
      );
      for (const row of rows) {
        if (row.dataset.conversationId === conversationId) {
          row.focus();
          break;
        }
      }
      focusOnReturnIdRef.current = null;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeId]);

  function selectConversation(conversation: Conversation) {
    setActiveId(conversation.id);
    onConversationChange?.(conversation);
  }

  async function createConversation(input: CreateConversationInput) {
    if (!onCreateConversation) return;
    selectConversation(await onCreateConversation(input));
  }

  return (
    <main className="bg-background h-dvh overflow-hidden p-0 sm:p-4 lg:p-6">
      <section className="bg-card shadow-soft mx-auto grid h-full min-h-0 max-w-[1480px] overflow-hidden sm:rounded-3xl sm:border lg:grid-cols-[22rem_1fr]">
        <aside
          className={`${activeConversation ? "hidden lg:flex" : "flex"} bg-sidebar min-h-0 flex-col lg:border-r`}
        >
          <header className="flex h-24 shrink-0 items-center justify-between px-5">
            <Brand compact />
            {onCreateConversation && (
              <CreateConversationDialog
                currentUserId={currentUserId}
                onCreate={createConversation}
              />
            )}
          </header>
          <div className="flex items-end justify-between px-6 pb-4">
            <div>
              <p className="text-muted-foreground text-xs font-semibold tracking-[0.15em] uppercase">
                Workspace
              </p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight">
                Messages
              </h1>
            </div>
            <span className="text-muted-foreground text-xs">
              {conversations.length}
            </span>
          </div>

          {conversationsError ? (
            <div className="px-5">
              <Alert variant="destructive">
                <AlertCircleIcon />
                <AlertTitle>Couldn&apos;t load conversations</AlertTitle>
                <AlertDescription>{conversationsError}</AlertDescription>
              </Alert>
              {onRetryConversations && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={onRetryConversations}
                >
                  Try again
                </Button>
              )}
            </div>
          ) : (
            <ConversationList
              conversations={conversations}
              currentUserId={currentUserId}
              activeId={activeConversation?.id ?? null}
              search={search}
              loading={conversationsLoading}
              canCreate={Boolean(onCreateConversation)}
              onSearchChange={setSearch}
              onSelect={selectConversation}
            />
          )}

          <div className="mt-auto border-t px-5 py-4">
            <p className="truncate px-2 text-sm font-medium">{username}</p>
            <p className="text-muted-foreground mb-2 truncate px-2 text-xs">
              Signed in securely
            </p>
            <div className="flex items-center justify-between gap-2">
              <SignOutButton />
              <ThemeToggle />
            </div>
          </div>
        </aside>

        <div
          className={`${activeConversation ? "flex" : "hidden lg:flex"} min-h-0`}
        >
          <ConversationPanel
            key={activeConversation?.id ?? "no-conversation"}
            conversation={activeConversation}
            currentUserId={currentUserId}
            messages={messages}
            loading={messagesLoading}
            error={messagesError}
            hasMore={hasOlderMessages}
            loadingMore={loadingOlderMessages}
            olderError={olderMessagesError}
            connectionState={connectionState}
            connectionError={connectionError}
            typingUserIds={typingUserIds}
            onRetry={onRetryMessages}
            onLoadMore={onLoadOlderMessages}
            onRetrySend={onRetrySendMessage}
            onTypingChange={onTypingChange}
            onBack={() => {
              focusOnReturnIdRef.current = activeConversation?.id ?? null;
              setActiveId(null);
              onConversationClose?.();
            }}
            onSend={
              activeConversation && onSendMessage
                ? (content) => onSendMessage(activeConversation.id, content)
                : undefined
            }
          />
        </div>
      </section>
    </main>
  );
}
