import { loginSchema } from "@/features/auth/auth-contract";
import { loginWithBackend } from "@/lib/auth/backend-auth";
import { saveLoginSession } from "@/lib/auth/session";
import { toClientError } from "@/lib/http/backend";

export async function POST(request: Request) {
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { message: "Check your email or username and password." },
      { status: 400 },
    );
  }

  try {
    const result = await loginWithBackend(parsed.data);
    await saveLoginSession(result);
    return Response.json({ userId: result.userId, username: result.username });
  } catch (reason) {
    return toClientError(reason, "The authentication service is unavailable.");
  }
}
