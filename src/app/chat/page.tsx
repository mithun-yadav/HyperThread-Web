import { ChatWorkspace } from "@/features/chat/components/chat-workspace";
import { readSession } from "@/lib/auth/session";

export default async function ChatFoundationPage() {
  const session = await readSession();
  if (!session) return null;
  return (
    <ChatWorkspace
      currentUserId={session.userId}
      username={session.username}
      conversations={[]}
    />
  );
}
