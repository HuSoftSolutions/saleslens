"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldQuestion } from "lucide-react";
import { getIdToken } from "@/lib/firebase/auth-context";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface Grant {
  id: string;
  grantedToEmail: string | null;
  reason: string;
  requestedDurationHours: number;
  status: "requested" | "active" | "denied" | "revoked" | "expired";
  createdAt: string | null;
  expiresAt: string | null;
}

function statusVariant(
  status: Grant["status"]
): "default" | "secondary" | "outline" | "destructive" {
  if (status === "active") return "default";
  if (status === "requested") return "secondary";
  if (status === "denied" || status === "revoked") return "destructive";
  return "outline";
}

async function authedPost(path: string, body?: unknown): Promise<string | null> {
  const token = await getIdToken().catch(() => null);
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.ok) return null;
  const data = await res.json().catch(() => null);
  return data?.error ?? "Something went wrong.";
}

export function SupportAccessCard() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [pending, setPending] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = await getIdToken().catch(() => null);
    if (!token) return setAuthorized(false);
    const res = await fetch("/api/access-grants", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return setAuthorized(false);
    const data = await res.json();
    setGrants(data.grants ?? []);
    setAuthorized(true);
  }, []);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  async function act(key: string, action: () => Promise<string | null>) {
    setPending(key);
    await action();
    await load();
    setPending(null);
  }

  if (authorized === false) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShieldQuestion className="size-5" />
          </span>
          <div>
            <CardTitle className="text-base">Support access</CardTitle>
            <CardDescription>
              SalesLens support can only view your data when you explicitly
              approve a time-limited request.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {authorized === null ? (
          <Skeleton className="h-16 w-full" />
        ) : grants.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No support access requests. You&apos;re in full control — nothing is
            shared unless you approve it.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {grants.map((g) => (
              <li
                key={g.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border/60 p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={statusVariant(g.status)}>{g.status}</Badge>
                    <span className="truncate text-sm font-medium">
                      {g.grantedToEmail ?? "SalesLens support"}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{g.reason}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {g.status === "active" && g.expiresAt
                      ? `Expires ${new Date(g.expiresAt).toLocaleString()}`
                      : `Requested ${g.requestedDurationHours}h of access`}
                  </p>
                </div>
                {g.status === "requested" && (
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      disabled={pending !== null}
                      onClick={() =>
                        act(g.id, () =>
                          authedPost(`/api/access-grants/${g.id}/decision`, {
                            decision: "approve",
                          })
                        )
                      }
                    >
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending !== null}
                      onClick={() =>
                        act(g.id, () =>
                          authedPost(`/api/access-grants/${g.id}/decision`, {
                            decision: "deny",
                          })
                        )
                      }
                    >
                      Deny
                    </Button>
                  </div>
                )}
                {g.status === "active" && (
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={pending !== null}
                    onClick={() =>
                      act(g.id, () => authedPost(`/api/access-grants/${g.id}/revoke`))
                    }
                  >
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
