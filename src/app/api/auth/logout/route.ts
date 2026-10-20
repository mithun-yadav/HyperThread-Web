import { clearLoginSession } from "@/lib/auth/session";

export async function POST() {
  await clearLoginSession();
  return new Response(null, { status: 204 });
}
