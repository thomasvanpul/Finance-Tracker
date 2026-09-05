// Between AuthGate and everything that reads localStorage at mount.
//
// Pages initialise state from localStorage synchronously in useState
// initialisers, so the server's copy of the
// account-level keys has to be in localStorage BEFORE the first page
// mounts, not after. This gate holds children until
// hydrateAccountStorage settles — one round trip, bounded at 6 s — and
// renders the same skeleton AuthGate uses while it waits.
//
// No session user (the offline cached-session path in AuthGate): the
// interceptor is installed so writes queue, and children render at once.

import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { hydrateAccountStorage, installAccountStorage } from "@/lib/account-storage";
import { PhoneScreenSkeleton } from "@/components/phone/PhoneScreenSkeleton";

export function PreferencesGate({ children }: { children: React.ReactNode }) {
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id ?? null;
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);

  useEffect(() => {
    installAccountStorage();
    if (!userId) return;
    let cancelled = false;
    void hydrateAccountStorage(userId).finally(() => {
      if (!cancelled) setHydratedFor(userId);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (userId && hydratedFor !== userId) {
    return (
      <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", background: "var(--ft-base)" }}>
        <PhoneScreenSkeleton shape="plain" />
      </div>
    );
  }
  return <>{children}</>;
}
