import { MessageCircleMoreIcon } from "lucide-react";
import { Brand } from "@/components/brand";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

export function FoundationShell({
  username = "Account",
}: {
  username?: string;
}) {
  return (
    <main className="bg-background text-foreground min-h-dvh p-0 sm:p-4 lg:p-6">
      <section className="bg-card shadow-soft mx-auto grid min-h-dvh max-w-[1480px] overflow-hidden sm:min-h-[calc(100dvh-2rem)] sm:rounded-3xl sm:border lg:min-h-[calc(100dvh-3rem)] lg:grid-cols-[22rem_1fr]">
        <aside className="bg-sidebar flex min-h-dvh flex-col sm:min-h-[calc(100dvh-2rem)] lg:min-h-0 lg:border-r">
          <header className="flex h-24 items-center px-6">
            <Brand />
          </header>
          <Separator />
          <div
            className="flex flex-col gap-4 p-5"
            aria-label="Conversation list loading"
          >
            <Skeleton className="h-11 w-full rounded-xl" />
            <Skeleton className="h-14 w-full rounded-2xl" />
            <Skeleton className="h-14 w-full rounded-2xl" />
            <Skeleton className="h-14 w-full rounded-2xl" />
          </div>
          <div className="mt-auto border-t px-5 py-4">
            <p className="text-foreground truncate px-2 text-sm font-medium">
              {username}
            </p>
            <p className="text-muted-foreground mb-2 truncate px-2 text-xs">
              Signed in securely
            </p>
            <SignOutButton />
          </div>
        </aside>
        <section className="bg-card hidden min-h-0 lg:grid lg:place-items-center">
          <Empty className="max-w-md">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MessageCircleMoreIcon />
              </EmptyMedia>
              <EmptyTitle>Your conversation space is ready</EmptyTitle>
              <EmptyDescription>
                Your conversations will appear here as soon as the chat service
                returns them. No sample conversation data is shown.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </section>
      </section>
    </main>
  );
}
