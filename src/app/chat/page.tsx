import { FoundationShell } from "@/features/chat/components/foundation-shell";
import { readSession } from "@/lib/auth/session";

export default async function ChatFoundationPage() {
  const session = await readSession();
  return <FoundationShell username={session?.username} />;
}
