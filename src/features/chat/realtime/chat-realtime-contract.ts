import { z } from "zod";
import { messageSchema, type Message } from "@/features/chat/chat-contract";

export const socketTokenSchema = z.object({
  accessToken: z.string().min(1),
});

export const messageStatusEventSchema = z.object({
  messageId: z.string(),
  conversationId: z.string(),
  senderId: z.string(),
  status: z.enum(["SENT", "DELIVERED", "READ"]),
});

export const typingEventSchema = z.object({
  conversationId: z.string(),
  userId: z.string(),
});

export const socketExceptionSchema = z.object({
  errorCode: z.string(),
  message: z.string(),
});

export const joinedConversationSchema = z.object({
  conversationId: z.string(),
});

export type MessageStatusEvent = z.infer<typeof messageStatusEventSchema>;
export type TypingEvent = z.infer<typeof typingEventSchema>;
export type SocketException = z.infer<typeof socketExceptionSchema>;

export type RealtimeConnectionState =
  "connecting" | "connected" | "reconnecting" | "offline";

export type ClientMessage = Message & {
  clientState?: "sending" | "failed";
  clientError?: string;
};

export type SendMessagePayload = {
  conversationId: string;
  content: string;
  idempotencyKey: string;
};

export { messageSchema };
