import Link from "next/link";

export default function NotFound() {
  return (
    <main className="bg-background text-foreground grid min-h-dvh place-items-center p-6">
      <div className="flex max-w-md flex-col gap-4 text-center">
        <p className="text-primary text-sm font-medium">404</p>
        <h1 className="text-3xl font-semibold">This thread is not here</h1>
        <p className="text-muted-foreground">
          The conversation may have moved or you may not have access.
        </p>
        <Link
          className="text-primary font-medium underline-offset-4 hover:underline"
          href="/chat"
        >
          Return to conversations
        </Link>
      </div>
    </main>
  );
}
