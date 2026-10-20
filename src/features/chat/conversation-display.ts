import type { Conversation } from "@/features/chat/chat-contract";

export function shortUserId(userId: string) {
  if (userId.length <= 12) return userId;
  return `${userId.slice(0, 6)}…${userId.slice(-4)}`;
}

export function conversationTitle(
  conversation: Conversation,
  currentUserId: string,
) {
  if (conversation.type === "GROUP") {
    return conversation.name?.trim() || "Unnamed group";
  }
  const peer = conversation.members.find(
    (member) => member.userId !== currentUserId,
  );
  return peer ? `Member ${shortUserId(peer.userId)}` : "Direct conversation";
}

export function conversationDescription(conversation: Conversation) {
  return conversation.type === "GROUP"
    ? `${conversation.members.length} members`
    : "Direct conversation";
}

export function conversationInitial(
  conversation: Conversation,
  currentUserId: string,
) {
  const title = conversationTitle(conversation, currentUserId);
  return title.charAt(0).toUpperCase();
}
