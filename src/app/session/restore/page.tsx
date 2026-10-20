import { SessionRestorer } from "@/features/auth/components/session-restorer";

export default async function RestoreSessionPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const requested = (await searchParams).next;
  const nextPath =
    requested?.startsWith("/") && !requested.startsWith("//")
      ? requested
      : "/chat";
  return <SessionRestorer nextPath={nextPath} />;
}
