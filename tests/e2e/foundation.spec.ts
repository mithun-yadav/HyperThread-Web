import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const sessionCookieNames = [
  "ht_access",
  "ht_refresh",
  "ht_user_id",
  "ht_username",
];

test("routes signed-out visitors to the responsive login experience", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("link", { name: "HyperThread" }).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Sign in to HyperThread" }),
  ).toBeVisible();
  await expect(page.getByLabel("Email or username")).toBeVisible();
});

test("protects chat and validates account creation", async ({ page }) => {
  await page.goto("/chat");
  await expect(page).toHaveURL(/\/login$/);

  await page.goto("/register");
  await expect(page).toHaveURL(/\/register$/);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(
    page.getByText("Username must be at least 3 characters."),
  ).toBeVisible();
  await expect(page.getByText("Enter a valid email address.")).toBeVisible();
});

test("creates a hardened session and signs out from the chat shell", async ({
  page,
  context,
}, testInfo) => {
  const username = `browser_${testInfo.project.name.replace(/\W/g, "_")}`;
  await page.goto("/login");
  await page.getByLabel("Email or username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill("Thread123");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/chat$/);
  await expect(page.getByText(username, { exact: true })).toBeVisible();
  const cookies = await context.cookies();
  for (const name of sessionCookieNames) {
    expect(cookies.find((cookie) => cookie.name === name)).toMatchObject({
      httpOnly: true,
      sameSite: "Lax",
    });
  }

  const tokenResponse = await page.request.get("/api/auth/socket-token");
  expect(tokenResponse.status()).toBe(200);
  expect(tokenResponse.headers()["cache-control"]).toContain("no-store");
  expect(await tokenResponse.json()).toEqual({
    accessToken: `access-${username}`,
  });

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  const logoutStats = await page.request.get(
    `http://127.0.0.1:4100/test/logout-stats?userId=${encodeURIComponent(`user-${username}`)}`,
  );
  expect(await logoutStats.json()).toEqual({ logoutCount: 1 });
  const remainingNames = (await context.cookies()).map((cookie) => cookie.name);
  for (const name of sessionCookieNames)
    expect(remainingNames).not.toContain(name);
});

test("rejects a forged session and clears its cookies", async ({
  page,
  context,
}) => {
  await context.addCookies(
    [
      ["ht_refresh", "invalid-forged"],
      ["ht_user_id", "forged-user"],
      ["ht_username", "forged"],
    ].map(([name, value]) => ({
      name,
      value,
      url: "http://localhost:5000",
      httpOnly: true,
      sameSite: "Lax" as const,
    })),
  );

  await page.goto("/chat");
  await expect(page).toHaveURL(/\/login$/);
  const remainingNames = (await context.cookies()).map((cookie) => cookie.name);
  for (const name of sessionCookieNames)
    expect(remainingNames).not.toContain(name);
});

test("coalesces concurrent refreshes and tolerates non-JSON auth failures", async ({
  page,
  context,
}, testInfo) => {
  const username = `parallel-${testInfo.project.name}-${Date.now()}`;
  const refreshToken = `refresh-${username}`;
  await context.addCookies(
    [
      ["ht_refresh", refreshToken],
      ["ht_user_id", `user-${username}`],
      ["ht_username", username],
    ].map(([name, value]) => ({
      name,
      value,
      url: "http://localhost:5000",
      httpOnly: true,
      sameSite: "Lax" as const,
    })),
  );

  const responses = await Promise.all(
    Array.from({ length: 5 }, () =>
      page.request.post("/api/auth/session/refresh"),
    ),
  );
  expect(responses.every((response) => response.status() === 200)).toBe(true);
  const stats = await page.request.get(
    `http://127.0.0.1:4100/test/stats?token=${encodeURIComponent(refreshToken)}`,
  );
  expect(await stats.json()).toEqual({ refreshCount: 1 });
  const socketToken = await page.request.get("/api/auth/socket-token");
  expect(socketToken.status()).toBe(200);

  await context.clearCookies();
  const failure = await page.request.post("/api/auth/login", {
    data: { identifier: "html-error", password: "Thread123" },
  });
  expect(failure.status()).toBe(500);
  expect(await failure.json()).toEqual({
    message: "We couldn't sign you in.",
  });
});

test("does not rotate in both Proxy and the socket-token route", async ({
  page,
  context,
}, testInfo) => {
  const username = `cross-runtime-${testInfo.project.name}-${Date.now()}`;
  const refreshToken = `refresh-${username}`;
  await context.addCookies(
    [
      ["ht_refresh", refreshToken],
      ["ht_user_id", `user-${username}`],
      ["ht_username", username],
    ].map(([name, value]) => ({
      name,
      value,
      url: "http://localhost:5000",
      httpOnly: true,
      sameSite: "Lax" as const,
    })),
  );

  const [, socketResponse] = await Promise.all([
    page.goto("/chat"),
    page.request.get("/api/auth/socket-token"),
  ]);
  expect([401, 200]).toContain(socketResponse.status());
  await expect(page).toHaveURL(/\/chat$/);
  const stats = await page.request.get(
    `http://127.0.0.1:4100/test/stats?token=${encodeURIComponent(refreshToken)}`,
  );
  expect(await stats.json()).toEqual({ refreshCount: 1 });
});

test("loads conversations and creates a direct thread through the BFF", async ({
  page,
}, testInfo) => {
  const username = `chat_${testInfo.project.name}_${Date.now()}`;
  await page.goto("/login");
  await page.getByLabel("Email or username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill("Thread123");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(
    page.getByRole("button", { name: /Project room/ }),
  ).toBeVisible();
  const conversationId = "11111111-1111-4111-8111-111111111111";
  await Promise.all(
    Array.from({ length: 48 }, (_, index) =>
      page.request.post("http://127.0.0.1:4101/test/inject-message", {
        data: {
          userId: `user-${username}`,
          conversationId,
          content: `Long timeline item ${index + 1}`,
        },
      }),
    ),
  );
  await page.getByRole("button", { name: /Project room/ }).click();
  await expect(page.getByText("Hello from the project room")).toBeVisible();
  const layoutMetrics = await page.evaluate(() => {
    const viewport = document.querySelector<HTMLElement>(
      'section[aria-label="Project room"] [data-slot="scroll-area-viewport"]',
    );
    return {
      documentHeight: document.documentElement.scrollHeight,
      windowHeight: window.innerHeight,
      viewportHeight: viewport?.clientHeight ?? 0,
      viewportScrollHeight: viewport?.scrollHeight ?? 0,
    };
  });
  expect(layoutMetrics.documentHeight).toBeLessThanOrEqual(
    layoutMetrics.windowHeight + 1,
  );
  expect(layoutMetrics.viewportHeight).toBeGreaterThan(0);
  expect(layoutMetrics.viewportScrollHeight).toBeGreaterThan(
    layoutMetrics.viewportHeight,
  );
  await page.getByRole("button", { name: "Load older messages" }).click();
  await expect(page.getByText("Earlier project context")).toBeVisible();
  const timeline = await page.locator("ol > li").allTextContents();
  expect(timeline.join(" ").indexOf("Earlier project context")).toBeLessThan(
    timeline.join(" ").indexOf("Hello from the project room"),
  );

  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: "Back to conversations" }).click();
  }
  await page.getByRole("button", { name: "New conversation" }).click();
  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: "Group", exact: true }).click();
    for (let index = 0; index < 7; index += 1) {
      await page.getByRole("button", { name: "Add member" }).click();
    }
    const dialogBox = await page.getByRole("dialog").boundingBox();
    const viewport = page.viewportSize();
    expect(dialogBox).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(dialogBox?.y).toBeGreaterThanOrEqual(0);
    expect((dialogBox?.y ?? 0) + (dialogBox?.height ?? 0)).toBeLessThanOrEqual(
      viewport?.height ?? 0,
    );
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("button", { name: "New conversation" }).click();
  }
  await page
    .getByLabel("Recipient user ID")
    .fill("550e8400-e29b-41d4-a716-446655440000");
  await page.getByRole("button", { name: "Create conversation" }).click();
  await expect(
    page.getByRole("heading", { name: "Member 550e84…0000" }),
  ).toBeVisible();
  await expect(page.getByText("No messages yet")).toBeVisible();

  const invalidPayload = await page.request.post(
    "/api/chat/conversations/direct",
    { data: { recipientId: "not-a-uuid" } },
  );
  expect(invalidPayload.status()).toBe(400);
  expect(invalidPayload.headers()["cache-control"]).toContain("no-store");
});

test("isolates conversation caches across account changes", async ({
  page,
}, testInfo) => {
  const suffix = `${testInfo.project.name}_${Date.now()}`;
  const firstUsername = `cache_a_${suffix}`;
  const secondUsername = `cache_b_${suffix}`;
  const privateRecipient = "6ba7b810-9dad-41d1-80b4-00c04fd430c8";

  await page.goto("/login");
  await page.getByLabel("Email or username").fill(firstUsername);
  await page.getByLabel("Password", { exact: true }).fill("Thread123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("button", { name: "New conversation" }).click();
  await page.getByLabel("Recipient user ID").fill(privateRecipient);
  await page.getByRole("button", { name: "Create conversation" }).click();
  await expect(
    page.getByRole("heading", { name: "Member 6ba7b8…30c8" }),
  ).toBeVisible();

  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: "Back to conversations" }).click();
  }
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByLabel("Email or username").fill(secondUsername);
  await page.getByLabel("Password", { exact: true }).fill("Thread123");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(
    page.getByRole("button", { name: /Project room/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Member 6ba7b8…30c8/ }),
  ).toHaveCount(0);
});

test("reconnects realtime messaging and retries with one idempotency key", async ({
  page,
}, testInfo) => {
  const username = `realtime_${testInfo.project.name}_${Date.now()}`;
  const userId = `user-${username}`;
  const conversationId = "11111111-1111-4111-8111-111111111111";
  await page.goto("/login");
  await page.getByLabel("Email or username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill("Thread123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("button", { name: /Project room/ }).click();

  const connection = page.getByRole("status").filter({ hasText: "Live" });
  await expect(connection).toHaveCount(1);

  await page.request.post("http://127.0.0.1:4101/test/typing", {
    data: {
      userId,
      conversationId,
      typingUserId: "6ba7b810-9dad-41d1-80b4-00c04fd430c8",
    },
  });
  await expect(page.getByText(/Member 6ba7b8…30c8 is typing/)).toBeVisible();

  const composer = page.getByRole("textbox", { name: "Message" });
  await composer.fill("Realtime hello");
  await composer.press("Enter");
  await expect(page.getByText("Realtime hello", { exact: true })).toHaveCount(
    1,
  );

  await composer.fill("Retry this safely");
  await composer.press("Enter");
  await expect(page.getByText(/· failed/)).toBeVisible();
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0);
  await expect(
    page.getByText("Retry this safely", { exact: true }),
  ).toHaveCount(1);

  await composer.fill("Persist during disconnect");
  await composer.press("Enter");
  await expect(
    page.getByRole("status").filter({ hasText: "Reconnecting" }),
  ).toHaveCount(1);
  await expect(connection).toHaveCount(1, { timeout: 15_000 });
  await expect(
    page.getByText("Persist during disconnect", { exact: true }),
  ).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0);

  const statsResponse = await page.request.get(
    `http://127.0.0.1:4101/test/socket-stats?userId=${encodeURIComponent(userId)}`,
  );
  const stats = (await statsResponse.json()) as {
    attempts: Array<{ idempotencyKey: string; content: string }>;
  };
  const retries = stats.attempts.filter(
    (attempt) => attempt.content === "Retry this safely",
  );
  expect(retries).toHaveLength(2);
  expect(retries[0].idempotencyKey).toBe(retries[1].idempotencyKey);

  await page.request.post("http://127.0.0.1:4101/test/inject-message", {
    data: {
      userId,
      conversationId,
      content: "Recovered after reconnect",
    },
  });
  await page.request.post("http://127.0.0.1:4101/test/disconnect", {
    data: { userId },
  });
  await expect(
    page.getByText("Recovered after reconnect", { exact: true }),
  ).toBeVisible({ timeout: 15_000 });

  const reconnectStatsResponse = await page.request.get(
    `http://127.0.0.1:4101/test/socket-stats?userId=${encodeURIComponent(userId)}`,
  );
  const reconnectStats = (await reconnectStatsResponse.json()) as {
    connections: number;
    joins: string[];
  };
  expect(reconnectStats.connections).toBeGreaterThanOrEqual(2);
  expect(
    reconnectStats.joins.filter((joinedId) => joinedId === conversationId)
      .length,
  ).toBeGreaterThanOrEqual(2);
});

test("acknowledges HTTP-loaded incoming direct messages as read", async ({
  page,
}, testInfo) => {
  const username = `receipts_${testInfo.project.name}_${Date.now()}`;
  const userId = `user-${username}`;
  const recipientId = "6ba7b810-9dad-41d1-80b4-00c04fd430c8";
  await page.goto("/login");
  await page.getByLabel("Email or username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill("Thread123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/chat$/);
  await expect(
    page.getByRole("button", { name: /Project room/ }),
  ).toBeVisible();

  const conversationResponse = await page.request.post(
    "/api/chat/conversations/direct",
    { data: { recipientId } },
  );
  expect(conversationResponse.status()).toBe(201);
  const conversation = (await conversationResponse.json()) as { id: string };
  const messageResponse = await page.request.post(
    "http://127.0.0.1:4101/test/inject-message",
    {
      data: {
        userId,
        conversationId: conversation.id,
        content: "Loaded before the room opened",
        senderId: recipientId,
      },
    },
  );
  const message = (await messageResponse.json()) as { id: string };

  await page.reload();
  await page.getByRole("button", { name: /Member 6ba7b8…30c8/ }).click();
  await expect(
    page.getByText("Loaded before the room opened", { exact: true }),
  ).toBeVisible();

  await expect
    .poll(async () => {
      const response = await page.request.get(
        `http://127.0.0.1:4101/test/socket-stats?userId=${encodeURIComponent(userId)}`,
      );
      const stats = (await response.json()) as {
        receipts: Array<{ type: string; messageId: string }>;
      };
      return stats.receipts.some(
        (receipt) =>
          receipt.type === "read" && receipt.messageId === message.id,
      );
    })
    .toBe(true);

  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: "Back to conversations" }).click();
  } else {
    await page.getByRole("button", { name: /Project room/ }).click();
  }
  const backgroundMessageResponse = await page.request.post(
    "http://127.0.0.1:4101/test/inject-message",
    {
      data: {
        userId,
        conversationId: conversation.id,
        content: "Delivered while the thread is hidden",
        senderId: recipientId,
      },
    },
  );
  const backgroundMessage = (await backgroundMessageResponse.json()) as {
    id: string;
  };
  await page.request.post("http://127.0.0.1:4101/test/broadcast-message", {
    data: { userId, conversationId: conversation.id, id: backgroundMessage.id },
  });

  await expect
    .poll(async () => {
      const response = await page.request.get(
        `http://127.0.0.1:4101/test/socket-stats?userId=${encodeURIComponent(userId)}`,
      );
      const stats = (await response.json()) as {
        receipts: Array<{ type: string; messageId: string }>;
      };
      return {
        delivered: stats.receipts.some(
          (receipt) =>
            receipt.type === "delivery" &&
            receipt.messageId === backgroundMessage.id,
        ),
        read: stats.receipts.some(
          (receipt) =>
            receipt.type === "read" &&
            receipt.messageId === backgroundMessage.id,
        ),
      };
    })
    .toEqual({ delivered: true, read: false });
});

test("has no serious accessibility violations in the core journey", async ({
  page,
}, testInfo) => {
  await page.goto("/login");
  const loginResults = await new AxeBuilder({ page }).analyze();
  expect(
    loginResults.violations.filter((violation) =>
      ["serious", "critical"].includes(violation.impact ?? ""),
    ),
  ).toEqual([]);

  await page.getByRole("button", { name: "Choose appearance" }).click();
  await page.getByRole("menuitemradio", { name: /Dark/ }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator('[data-aria-hidden="true"]')).toHaveCount(0);
  const darkLoginResults = await new AxeBuilder({ page }).analyze();
  expect(
    darkLoginResults.violations.filter((violation) =>
      ["serious", "critical"].includes(violation.impact ?? ""),
    ),
  ).toEqual([]);

  const username = `a11y_${testInfo.project.name}_${Date.now()}`;
  await page.getByLabel("Email or username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill("Thread123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("button", { name: /Project room/ }).click();
  await page
    .getByRole("textbox", { name: "Message" })
    .fill("Accessibility status check");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Accessibility status check")).toBeVisible();
  const chatResults = await new AxeBuilder({ page })
    .exclude("#next-logo")
    .analyze();
  expect(
    chatResults.violations.filter((violation) =>
      ["serious", "critical"].includes(violation.impact ?? ""),
    ),
  ).toEqual([]);

  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: "Back to conversations" }).click();
  }
  await page.getByRole("button", { name: "Choose appearance" }).click();
  await page.getByRole("menuitemradio", { name: /Light/ }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await expect(page.locator('[data-aria-hidden="true"]')).toHaveCount(0);
  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: /Project room/ }).click();
    await expect(page.getByText("Accessibility status check")).toBeVisible();
  }
  const lightChatResults = await new AxeBuilder({ page })
    .exclude("#next-logo")
    .analyze();
  expect(
    lightChatResults.violations.filter((violation) =>
      ["serious", "critical"].includes(violation.impact ?? ""),
    ),
  ).toEqual([]);
});

test("persists an explicit appearance preference", async ({
  page,
}, testInfo) => {
  const username = `theme_${testInfo.project.name}_${Date.now()}`;
  await page.goto("/login");
  await page.getByLabel("Email or username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill("Thread123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("button", { name: /Project room/ }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Choose appearance" }).click();
  await page.getByRole("menuitemradio", { name: /Dark/ }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
});
