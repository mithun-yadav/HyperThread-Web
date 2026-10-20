import { describe, expect, it } from "vitest";
import { chatKeys } from "./chat-api";

describe("chat query keys", () => {
  it("isolates protected data by authenticated user", () => {
    expect(chatKeys.conversations("user-a")).toEqual([
      "chat",
      "user-a",
      "conversations",
    ]);
    expect(chatKeys.conversations("user-a")).not.toEqual(
      chatKeys.conversations("user-b"),
    );
    expect(chatKeys.messages("user-a", "conversation-1")).toEqual([
      "chat",
      "user-a",
      "messages",
      "conversation-1",
    ]);
  });
});
