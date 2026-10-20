import { registerSchema } from "@/features/auth/auth-contract";
import { registerWithBackend } from "@/lib/auth/backend-auth";
import { toClientError } from "@/lib/http/backend";

export async function POST(request: Request) {
  const parsed = registerSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return Response.json(
      { message: "Check the account details and try again." },
      { status: 400 },
    );
  }

  try {
    const result = await registerWithBackend(parsed.data);
    return Response.json(result, { status: 201 });
  } catch (reason) {
    return toClientError(reason, "The registration service is unavailable.");
  }
}
