"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircleIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type RefreshResult = { ok: boolean; status: number };
let refreshRequest: Promise<RefreshResult> | null = null;

function refreshSession() {
  if (refreshRequest) return refreshRequest;
  const request = fetch("/api/auth/session/refresh", { method: "POST" })
    .then((response) => ({ ok: response.ok, status: response.status }))
    .catch(() => ({ ok: false, status: 503 }));
  refreshRequest = request;
  void request.then(() => {
    window.setTimeout(() => {
      if (refreshRequest === request) refreshRequest = null;
    }, 5_000);
  });
  return request;
}

export function SessionRestorer({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const started = useRef(false);
  const [failed, setFailed] = useState(false);

  const restore = useCallback(async () => {
    setFailed(false);
    const result = await refreshSession();
    if (result.ok) {
      router.replace(nextPath);
      router.refresh();
      return;
    }
    if (result.status === 401) {
      router.replace("/login");
      router.refresh();
      return;
    }
    setFailed(true);
  }, [nextPath, router]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void restore();
  }, [restore]);

  function retry() {
    refreshRequest = null;
    void restore();
  }

  return (
    <main className="bg-background grid min-h-dvh place-items-center p-6">
      <section className="w-full max-w-md text-center">
        {failed ? (
          <>
            <Alert variant="destructive" className="mb-5 text-left">
              <AlertCircleIcon />
              <AlertTitle>We couldn&apos;t restore your session</AlertTitle>
              <AlertDescription>
                The authentication service may be temporarily unavailable.
              </AlertDescription>
            </Alert>
            <Button onClick={retry}>Try again</Button>
          </>
        ) : (
          <>
            <Spinner className="text-primary mx-auto size-7" />
            <h1 className="mt-5 text-xl font-semibold">
              Restoring your session
            </h1>
            <p className="text-muted-foreground mt-2 text-sm">
              Securely reconnecting you to HyperThread…
            </p>
          </>
        )}
      </section>
    </main>
  );
}
