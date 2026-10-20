import { z } from "zod";

const clientEnvSchema = z.object({ NEXT_PUBLIC_SOCKET_URL: z.url() });

export function getClientEnv() {
  const allowLocalDefaults = process.env.NODE_ENV !== "production";

  return clientEnvSchema.parse({
    NEXT_PUBLIC_SOCKET_URL:
      process.env.NEXT_PUBLIC_SOCKET_URL ??
      (allowLocalDefaults ? "http://localhost:4001" : undefined),
  });
}
