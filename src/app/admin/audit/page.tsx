"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getIdToken } from "@/lib/firebase/auth-context";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface AuditEntry {
  id: string;
  action: string;
  actorUid: string;
  actorEmail: string | null;
  target: { uid?: string; orgId?: string };
  details: Record<string, unknown>;
  createdAt: string | null;
}

const ACTION_LABELS: Record<string, string> = {
  "platformAdmin.grant": "Granted platform admin",
  "platformAdmin.revoke": "Revoked platform admin",
  "org.role.change": "Changed org role",
  "org.suspend": "Suspended organization",
  "org.unsuspend": "Reactivated organization",
  "user.disable": "Disabled account",
  "user.enable": "Enabled account",
  "dataAccess.request": "Requested data access",
  "dataAccess.view": "Viewed consented data",
};

function isDestructive(action: string): boolean {
  return (
    action === "platformAdmin.revoke" ||
    action === "org.suspend" ||
    action === "user.disable"
  );
}

function summarizeDetails(entry: AuditEntry): string {
  const d = entry.details;
  if (entry.action === "org.role.change") return `${d.from} → ${d.to}`;
  if (typeof d.targetEmail === "string") return d.targetEmail;
  if (typeof d.orgName === "string") return d.orgName;
  return entry.target.orgId ?? entry.target.uid ?? "";
}

export default function AdminAudit() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await getIdToken().catch(() => null);
      if (!token) return setLoading(false);
      fetch("/api/platform/audit", {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => setEntries(d?.entries ?? []))
        .catch(() => setEntries([]))
        .finally(() => setLoading(false));
    })();
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-xl font-medium">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          Every platform-admin action, newest first. Append-only.
        </p>
      </div>

      <Card className="p-0">
        {loading ? (
          <div className="flex flex-col gap-3 p-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        ) : !entries || entries.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No actions recorded yet.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {entries.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant={isDestructive(e.action) ? "destructive" : "outline"}>
                      {ACTION_LABELS[e.action] ?? e.action}
                    </Badge>
                    <span className="truncate text-sm">{summarizeDetails(e)}</span>
                  </div>
                  <span className="block truncate text-xs text-muted-foreground">
                    by {e.actorEmail ?? e.actorUid}
                    {e.target.orgId && (
                      <>
                        {" · "}
                        <Link
                          href={`/admin/organizations/${e.target.orgId}`}
                          className="hover:text-foreground"
                        >
                          org
                        </Link>
                      </>
                    )}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {e.createdAt ? new Date(e.createdAt).toLocaleString() : "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
