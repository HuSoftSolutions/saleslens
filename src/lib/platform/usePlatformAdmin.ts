"use client";

import { useEffect, useState } from "react";
import { useAuth, getIdToken, getPlatformAdminClaim } from "@/lib/firebase/auth-context";

interface PlatformAdminState {
  isAdmin: boolean;
  checking: boolean;
}

/**
 * Resolves whether the signed-in user is a platform admin.
 *
 * Flow: once auth is ready, hit /api/platform/bootstrap (which mints the claim
 * for allowlisted operators on first run). If the claim was just granted, the
 * server flags `refreshed` and we force a token refresh so the new claim lands
 * — this prevents the lock-out where a freshly-elevated admin still holds a
 * stale token. Then read the claim off the token.
 */
export function usePlatformAdmin(): PlatformAdminState {
  const { user, loading } = useAuth();
  const [state, setState] = useState<PlatformAdminState>({
    isAdmin: false,
    checking: true,
  });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (loading) return;
      if (!user) {
        if (!cancelled) setState({ isAdmin: false, checking: false });
        return;
      }

      try {
        const token = await getIdToken();
        const res = await fetch("/api/platform/bootstrap", {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const data = res.ok ? await res.json() : null;
        const isAdmin = await getPlatformAdminClaim(data?.refreshed === true);
        if (!cancelled) setState({ isAdmin, checking: false });
      } catch {
        if (!cancelled) setState({ isAdmin: false, checking: false });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, loading]);

  return state;
}
