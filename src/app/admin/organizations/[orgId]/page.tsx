"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getIdToken } from "@/lib/firebase/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SupportDataAccessSection } from "@/components/support-data-access-section";

interface MerchantStatus {
  merchantId: string;
  name: string | null;
  status: "active" | "error";
  environment: "sandbox" | "production";
  source: "oauth" | "token";
  connectedAt: string | null;
  lastSyncAt: string | null;
}

interface OrgMember {
  uid: string;
  email: string | null;
  role: string;
  requestsToday: number;
}

interface OrgDetail {
  orgId: string;
  name: string | null;
  createdAt: string | null;
  status: "active" | "suspended";
  members: OrgMember[];
  merchants: MerchantStatus[];
}

const ROLES = ["owner", "admin", "member"] as const;

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

async function authedPost(path: string, body: unknown): Promise<string | null> {
  const token = await getIdToken().catch(() => null);
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (res.ok) return null;
  const data = await res.json().catch(() => null);
  return data?.error ?? "Something went wrong.";
}

export default function AdminOrgDetail() {
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;
  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = await getIdToken().catch(() => null);
    if (!token) return setLoading(false);
    try {
      const res = await fetch(`/api/platform/organizations/${orgId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      setOrg(res.ok ? await res.json() : null);
    } catch {
      setOrg(null);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  async function run(action: () => Promise<string | null>) {
    setPending(true);
    setError(null);
    const err = await action();
    if (err) setError(err);
    else await load();
    setPending(false);
  }

  const toggleSuspend = () =>
    run(() =>
      authedPost(`/api/platform/organizations/${orgId}/status`, {
        status: org?.status === "suspended" ? "active" : "suspended",
      })
    );

  const changeRole = (uid: string, role: string) =>
    run(() =>
      authedPost(
        `/api/platform/organizations/${orgId}/members/${uid}/role`,
        { role }
      )
    );

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/organizations"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Organizations
      </Link>

      {loading ? (
        <Skeleton className="h-8 w-48" />
      ) : notFound || !org ? (
        <p className="text-sm text-muted-foreground">Organization not found.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-heading text-xl font-medium">
                  {org.name ?? "Unnamed"}
                </h1>
                {org.status === "suspended" && (
                  <Badge variant="destructive">Suspended</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {org.orgId} · created {formatDateTime(org.createdAt)}
              </p>
            </div>
            <Button
              variant={org.status === "suspended" ? "outline" : "destructive"}
              size="sm"
              disabled={pending}
              onClick={toggleSuspend}
            >
              {org.status === "suspended" ? "Reactivate" : "Suspend"}
            </Button>
          </div>

          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Members ({org.members.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-border/60">
                {org.members.map((m) => (
                  <li
                    key={m.uid}
                    className="flex items-center justify-between gap-4 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {m.email ?? m.uid}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {m.requestsToday} requests today
                      </span>
                    </div>
                    <select
                      value={m.role}
                      disabled={pending}
                      onChange={(e) => changeRole(m.uid, e.target.value)}
                      aria-label={`Role for ${m.email ?? m.uid}`}
                      className="h-7 rounded-md border border-border bg-background px-2 text-sm capitalize disabled:opacity-50"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Clover connections ({org.merchants.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {org.merchants.length === 0 ? (
                <p className="px-4 pb-4 text-sm text-muted-foreground">
                  No locations connected.
                </p>
              ) : (
                <ul className="divide-y divide-border/60">
                  {org.merchants.map((m) => (
                    <li
                      key={m.merchantId}
                      className="flex items-center justify-between gap-4 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {m.name ?? m.merchantId}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {m.environment} · {m.source} · synced{" "}
                          {formatDateTime(m.lastSyncAt)}
                        </span>
                      </div>
                      <Badge
                        variant={m.status === "active" ? "default" : "destructive"}
                      >
                        {m.status}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            Connection status only — access tokens and transaction data are never
            exposed to platform admins.
          </p>

          <SupportDataAccessSection orgId={org.orgId} />
        </>
      )}
    </div>
  );
}
