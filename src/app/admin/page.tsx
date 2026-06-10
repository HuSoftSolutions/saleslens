"use client";

import { useEffect, useState } from "react";
import { Building2, Users, Store, Activity } from "lucide-react";
import { getIdToken } from "@/lib/firebase/auth-context";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface Overview {
  orgCount: number;
  userCount: number;
  merchantCount: number;
  activeMerchantCount: number;
  requestsToday: number;
}

const tiles = [
  { key: "orgCount", label: "Organizations", icon: Building2 },
  { key: "userCount", label: "Users", icon: Users },
  { key: "activeMerchantCount", label: "Active connections", icon: Store },
  { key: "requestsToday", label: "Requests today", icon: Activity },
] as const;

export default function AdminOverview() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await getIdToken().catch(() => null);
      if (!token) return setLoading(false);
      fetch("/api/platform/overview", {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => setData(d))
        .catch(() => setData(null))
        .finally(() => setLoading(false));
    })();
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-xl font-medium">Platform overview</h1>
        <p className="text-sm text-muted-foreground">
          Account and lifecycle metrics across every SalesLens organization.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <Card key={tile.key} size="sm">
              <CardContent className="flex flex-col gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-4" />
                </span>
                {loading ? (
                  <Skeleton className="h-7 w-16" />
                ) : (
                  <span className="font-heading text-2xl font-medium tabular-nums">
                    {data ? data[tile.key].toLocaleString() : "—"}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">{tile.label}</span>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Platform admins manage accounts only. Business sales, analytics, and chat
        contents are never shown here — that data is default-deny and reachable
        only through an explicit, customer-consented access grant.
      </p>
    </div>
  );
}
