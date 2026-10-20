import { Spinner } from "@/components/ui/spinner";

export default function Loading() {
  return (
    <main className="bg-background grid min-h-dvh place-items-center p-6">
      <div
        className="text-muted-foreground flex items-center gap-3 text-sm"
        role="status"
      >
        <Spinner aria-hidden="true" role="presentation" />
        <span>Loading HyperThread…</span>
      </div>
    </main>
  );
}
