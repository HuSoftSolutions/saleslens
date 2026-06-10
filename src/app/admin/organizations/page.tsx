"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getIdToken } from "@/lib/firebase/auth-context";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface OrgSummary {
  orgId: string;
  name: string | null;
  createdAt: string | null;
  status: "active" | "suspended";
  memberCount: number;
  merchantCount: number;
  activeMerchantCount: number;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

export default function AdminOrganizations() {
  const [orgs, setOrgs] = useState<OrgSummary[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await getIdToken().catch(() => null);
      if (!token) return setLoading(false);
      fetch("/api/platform/organizations", {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => setOrgs(d?.organizations ?? []))
        .catch(() => setOrgs([]))
        .finally(() => setLoading(false));
    })();
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-xl font-medium">Organizations</h1>
        <p className="text-sm text-muted-foreground">
          Every account on the platform. Counts only — no business data.
        </p>
      </div>

      <Card className="p-0">
        <div className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-border/60 px-4 py-2.5 text-xs font-medium text-muted-foreground sm:grid-cols-[1fr_repeat(3,7rem)_auto]">
          <span>Name</span>
          <span className="hidden text-right sm:block">Members</span>
          <span className="hidden text-right sm:block">Locations</span>
          <span className="hidden text-right sm:block">Created</span>
          <span className="sr-only">Open</span>
        </div>

        {loading ? (
          <div className="flex flex-col gap-3 p-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        ) : !orgs || orgs.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No organizations yet.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {orgs.map((org) => (
              <li key={org.orgId}>
                <Link
                  href={`/admin/organizations/${org.orgId}`}
                  className="grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/50 sm:grid-cols-[1fr_repeat(3,7rem)_auto]"
                >
                  <div className="min-w-0">
                    <span className="flex items-center gap-2 truncate font-medium">
                      {org.name ?? "Unnamed"}
                      {org.status === "suspended" && (
                        <Badge variant="destructive">Suspended</Badge>
                      )}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {org.orgId}
                    </span>
                  </div>
                  <span className="hidden text-right text-sm tabular-nums sm:block">
                    {org.memberCount}
                  </span>
                  <span className="hidden items-center justify-end gap-1.5 text-right text-sm tabular-nums sm:flex">
                    {org.activeMerchantCount}
                    {org.merchantCount !== org.activeMerchantCount && (
                      <Badge variant="outline">{org.merchantCount} total</Badge>
                    )}
                  </span>
                  <span className="hidden text-right text-sm text-muted-foreground tabular-nums sm:block">
                    {formatDate(org.createdAt)}
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
