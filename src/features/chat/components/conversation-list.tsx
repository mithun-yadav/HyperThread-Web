"use client";

import { MessageCircleMoreIcon, SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import type { Conversation } from "@/features/chat/chat-contract";
import {
  conversationDescription,
  conversationInitial,
  conversationTitle,
} from "@/features/chat/conversation-display";

export function ConversationList({
  conversations,
  currentUserId,
  activeId,
  search,
  loading,
  canCreate,
  onSearchChange,
  onSelect,
}: {
  conversations: Conversation[];
  currentUserId: string;
  activeId: string | null;
  search: string;
  loading: boolean;
  canCreate: boolean;
  onSearchChange: (value: string) => void;
  onSelect: (conversation: Conversation) => void;
}) {
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visible = conversations.filter((conversation) =>
    `${conversationTitle(conversation, currentUserId)} ${conversation.id}`
      .toLocaleLowerCase()
      .includes(normalizedSearch),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative px-5 pb-4">
        <SearchIcon
          className="text-muted-foreground pointer-events-none absolute top-3 left-8 size-4"
          aria-hidden="true"
        />
        <Input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search conversations"
          aria-label="Search conversations"
          className="bg-muted h-10 rounded-xl pl-10 shadow-none"
        />
      </div>

      <ScrollArea className="min-h-0 flex-1 px-3">
        {loading ? (
          <div
            className="space-y-2 px-2 py-1"
            aria-label="Loading conversations"
            role="status"
            aria-live="polite"
          >
            <span className="sr-only">Loading conversations</span>
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-[4.5rem] rounded-2xl" />
            ))}
          </div>
        ) : visible.length > 0 ? (
          <div className="space-y-1 pb-5">
            {visible.map((conversation) => {
              const active = conversation.id === activeId;
              return (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => onSelect(conversation)}
                  aria-current={active ? "page" : undefined}
                  className="hover:bg-muted aria-[current=page]:bg-primary/9 flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors"
                >
                  <span
                    className="bg-primary/10 text-primary grid size-11 shrink-0 place-items-center rounded-2xl text-sm font-semibold"
                    aria-hidden="true"
                  >
                    {conversationInitial(conversation, currentUserId)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {conversationTitle(conversation, currentUserId)}
                    </span>
                    <span className="text-muted-foreground mt-0.5 block truncate text-xs">
                      {conversationDescription(conversation)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="grid min-h-64 place-items-center px-6 text-center">
            <div>
              <MessageCircleMoreIcon
                className="text-muted-foreground/65 mx-auto size-8"
                aria-hidden="true"
              />
              <p className="mt-3 text-sm font-medium">
                {search ? "No matching conversations" : "No conversations yet"}
              </p>
              <p className="text-muted-foreground mt-1 text-xs leading-5">
                {search
                  ? "Try a name or conversation ID."
                  : canCreate
                    ? "Start a direct thread or create a group."
                    : "Conversations will appear here when they are available."}
              </p>
            </div>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
