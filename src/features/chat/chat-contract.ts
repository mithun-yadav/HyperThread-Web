import { z } from "zod";

export const conversationMemberSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  userId: z.string(),
  role: z.enum(["ADMIN", "MEMBER"]),
  joinedAt: z.string(),
});

export const conversationSchema = z.object({
  id: z.string(),
  type: z.enum(["DIRECT", "GROUP"]),
  name: z.string().nullable(),
  directKey: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  members: z.array(conversationMemberSchema),
});

export const messageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  senderId: z.string(),
  content: z.string(),
  idempotencyKey: z.string(),
  status: z.enum(["SENT", "DELIVERED", "READ"]),
  createdAt: z.string(),
  editedAt: z.string().nullable(),
  deletedAt: z.string().nullable(),
});

export const messagePageSchema = z.object({
  messages: z.array(messageSchema),
  hasMore: z.boolean(),
  nextBefore: z.string().nullable().optional(),
});

export const createConversationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("DIRECT"), recipientId: z.uuidv4() }),
  z.object({
    type: z.literal("GROUP"),
    name: z.string().trim().min(2).max(50),
    memberIds: z
      .array(z.uuidv4())
      .min(2)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: "Member IDs must be unique.",
      }),
  }),
]);

export type Conversation = z.infer<typeof conversationSchema>;
export type Message = z.infer<typeof messageSchema>;
export type MessagePage = z.infer<typeof messagePageSchema>;
export type CreateConversationInput = z.infer<typeof createConversationSchema>;
