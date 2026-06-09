"use client";

import { useEffect, useState } from "react";
import { Gauge } from "lucide-react";
import { getIdToken } from "@/lib/firebase/auth-context";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface UserRow {
  uid: string;
  email: string | null;
  role: string;
  limits: { perMinute?: number; perDay?: number } | null;
  usedToday: number;
}
interface Limits {
  perMinute: number;
  perDay: number;
}

export function UsageLimitsCard() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [defaults, setDefaults] = useState<Limits | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [edits, setEdits] = useState<Record<string, { perMinute: string; perDay: string }>>({});
  const [savingUid, setSavingUid] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const token = await getIdToken();
        if (!token) return setAuthorized(false);
        const res = await fetch("/api/admin/user-limits", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 403 || res.status === 401) return setAuthorized(false);
        if (!res.ok) return setAuthorized(false);
        const data = await res.json();
        setDefaults(data.defaults);
        setUsers(data.users);
        setEdits(
          Object.fromEntries(
            data.users.map((u: UserRow) => [
              u.uid,
              {
                perMinute: u.limits?.perMinute?.toString() ?? "",
                perDay: u.limits?.perDay?.toString() ?? "",
              },
            ])
          )
        );
        setAuthorized(true);
      } catch {
        setAuthorized(false);
      }
    })();
  }, []);

  async function save(uid: string) {
    setSavingUid(uid);
    try {
      const token = await getIdToken();
      if (!token) return;
      const e = edits[uid];
      const res = await fetch("/api/admin/user-limits", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          uid,
          perMinute: e.perMinute.trim() === "" ? null : Number(e.perMinute),
          perDay: e.perDay.trim() === "" ? null : Number(e.perDay),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error ?? "Failed to save");
      }
    } finally {
      setSavingUid(null);
    }
  }

  // Hide entirely for non-admins (or while we don't yet know).
  if (authorized === false) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Gauge className="size-5" />
          </span>
          <div>
            <CardTitle className="text-base">Usage limits</CardTitle>
            <CardDescription>
              Per-user question limits. Leave blank to use the org default
              {defaults ? ` (${defaults.perMinute}/min, ${defaults.perDay}/day)` : ""}.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {authorized === null ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          users.map((u) => (
            <div
              key={u.uid}
              className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-end sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">
                    {u.email ?? u.uid}
                  </span>
                  <Badge variant="secondary" className="capitalize">
                    {u.role}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Used today: {u.usedToday}
                </p>
              </div>
              <div className="flex items-end gap-2">
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Per minute
                  <Input
                    type="number"
                    min={0}
                    className="h-8 w-24"
                    placeholder={defaults ? String(defaults.perMinute) : ""}
                    value={edits[u.uid]?.perMinute ?? ""}
                    onChange={(ev) =>
                      setEdits((p) => ({
                        ...p,
                        [u.uid]: { ...p[u.uid], perMinute: ev.target.value },
                      }))
                    }
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Per day
                  <Input
                    type="number"
                    min={0}
                    className="h-8 w-24"
                    placeholder={defaults ? String(defaults.perDay) : ""}
                    value={edits[u.uid]?.perDay ?? ""}
                    onChange={(ev) =>
                      setEdits((p) => ({
                        ...p,
                        [u.uid]: { ...p[u.uid], perDay: ev.target.value },
                      }))
                    }
                  />
                </label>
                <Button
                  size="sm"
                  onClick={() => save(u.uid)}
                  disabled={savingUid === u.uid}
                >
                  {savingUid === u.uid ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
