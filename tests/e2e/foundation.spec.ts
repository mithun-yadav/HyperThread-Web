import { expect, test } from "@playwright/test";

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
  await page.getByRole("button", { name: /Project room/ }).click();
  await expect(page.getByText("Hello from the project room")).toBeVisible();
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
