import { describe, expect, it } from "vitest";
import { createConversationSchema } from "./chat-contract";

const uuidV4A = "550e8400-e29b-41d4-a716-446655440000";
const uuidV4B = "6ba7b810-9dad-41d1-80b4-00c04fd430c8";

describe("createConversationSchema", () => {
  it("accepts unique UUID v4 recipients", () => {
    expect(
      createConversationSchema.safeParse({
        type: "GROUP",
        name: "Design crew",
        memberIds: [uuidV4A, uuidV4B],
      }).success,
    ).toBe(true);
  });

  it("rejects UUID versions the backend rejects", () => {
    expect(
      createConversationSchema.safeParse({
        type: "DIRECT",
        recipientId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate group members", () => {
    expect(
      createConversationSchema.safeParse({
        type: "GROUP",
        name: "Design crew",
        memberIds: [uuidV4A, uuidV4A],
      }).success,
    ).toBe(false);
  });
});
