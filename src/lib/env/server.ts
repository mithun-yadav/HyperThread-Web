import "server-only";
import { z } from "zod";

const serverEnvSchema = z.object({
  AUTH_SERVICE_URL: z.url(),
  CHAT_SERVICE_URL: z.url(),
});

export function getServerEnv() {
  const allowLocalDefaults = process.env.NODE_ENV !== "production";

  return serverEnvSchema.parse({
    AUTH_SERVICE_URL:
      process.env.AUTH_SERVICE_URL ??
      (allowLocalDefaults ? "http://localhost:4000" : undefined),
    CHAT_SERVICE_URL:
      process.env.CHAT_SERVICE_URL ??
      (allowLocalDefaults ? "http://localhost:4001" : undefined),
  });
}
