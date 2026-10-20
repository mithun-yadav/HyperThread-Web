import { ChatController } from "@/features/chat/components/chat-controller";
import { readSession } from "@/lib/auth/session";

export default async function ChatFoundationPage() {
  const session = await readSession();
  if (!session) return null;
  return <ChatController session={session} />;
}
