"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldQuestion } from "lucide-react";
import { getIdToken } from "@/lib/firebase/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

interface Grant {
  id: string;
  reason: string;
  requestedDurationHours: number;
  status: "requested" | "active" | "denied" | "revoked" | "expired";
  expiresAt: string | null;
}

interface DataView {
  connected: boolean;
  grantExpiresAt?: string | null;
  today?: { grossTotal: number; paymentCount: number };
  last30Days?: { grossTotal: number; paymentCount: number };
  error?: string;
}

const DURATIONS = [
  { label: "1 hour", value: 1 },
  { label: "8 hours", value: 8 },
  { label: "24 hours", value: 24 },
  { label: "3 days", value: 72 },
  { label: "7 days", value: 168 },
];

function money(dollars: number): string {
  // getSalesSummary already returns dollars (gross_cents / 100).
  return `$${dollars.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

async function authedGet(path: string) {
  const token = await getIdToken().catch(() => null);
  const res = await fetch(path, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  return res.ok ? res.json() : null;
}

export function SupportDataAccessSection({ orgId }: { orgId: string }) {
  const [grants, setGrants] = useState<Grant[] | null>(null);
  const [reason, setReason] = useState("");
  const [hours, setHours] = useState(24);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DataView | null>(null);

  const load = useCallback(async () => {
    const res = await authedGet(`/api/platform/organizations/${orgId}/access-request`);
    setGrants(res?.grants ?? []);
  }, [orgId]);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  const activeGrant = grants?.find((g) => g.status === "active") ?? null;
  const pendingGrant = grants?.find((g) => g.status === "requested") ?? null;

  async function requestAccess() {
    setBusy(true);
    setError(null);
    const token = await getIdToken().catch(() => null);
    const res = await fetch(`/api/platform/organizations/${orgId}/access-request`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ reason, durationHours: hours }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      setError(d?.error ?? "Request failed.");
    } else {
      setReason("");
      await load();
    }
    setBusy(false);
  }

  async function loadData() {
    setBusy(true);
    setError(null);
    const res = await authedGet(`/api/platform/organizations/${orgId}/data/overview`);
    if (!res) setError("Could not load data (grant may have expired).");
    else setData(res);
    setBusy(false);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShieldQuestion className="size-5" />
          </span>
          <CardTitle className="text-base">Support data access</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {grants === null ? (
          <Skeleton className="h-16 w-full" />
        ) : activeGrant ? (
          <>
            <div className="flex items-center gap-2">
              <Badge>Access granted by customer</Badge>
              {activeGrant.expiresAt && (
                <span className="text-xs text-muted-foreground">
                  expires {new Date(activeGrant.expiresAt).toLocaleString()}
                </span>
              )}
            </div>
            {data?.connected ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border/60 p-3">
                  <p className="text-xs text-muted-foreground">Today</p>
                  <p className="font-heading text-lg font-medium tabular-nums">
                    {money(data.today?.grossTotal ?? 0)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {data.today?.paymentCount ?? 0} payments
                  </p>
                </div>
                <div className="rounded-lg border border-border/60 p-3">
                  <p className="text-xs text-muted-foreground">Last 30 days</p>
                  <p className="font-heading text-lg font-medium tabular-nums">
                    {money(data.last30Days?.grossTotal ?? 0)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {data.last30Days?.paymentCount ?? 0} payments
                  </p>
                </div>
              </div>
            ) : (
              <Button variant="outline" size="sm" disabled={busy} onClick={loadData}>
                Load consented data
              </Button>
            )}
          </>
        ) : pendingGrant ? (
          <div className="flex flex-col gap-1">
            <Badge variant="secondary" className="w-fit">
              Awaiting customer approval
            </Badge>
            <p className="text-sm text-muted-foreground">
              Requested {pendingGrant.requestedDurationHours}h — &ldquo;
              {pendingGrant.reason}&rdquo;
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">
              You have no access to this business&apos;s data. Request it — the
              customer must approve before anything is shared.
            </p>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason for access (shown to the customer)"
            />
            <div className="flex items-center gap-2">
              <select
                value={hours}
                onChange={(e) => setHours(Number(e.target.value))}
                aria-label="Access duration"
                className="h-8 rounded-md border border-border bg-background px-2 text-sm"
              >
                {DURATIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                disabled={busy || reason.trim().length < 3}
                onClick={requestAccess}
              >
                Request access
              </Button>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
        <p className="text-xs text-muted-foreground">
          Consent-based and time-boxed. The customer can revoke at any time, and
          every data view is recorded in the audit log.
        </p>
      </CardContent>
    </Card>
  );
}
