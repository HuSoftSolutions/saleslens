"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, ShieldCheck, Ban } from "lucide-react";
import { getIdToken, useAuth } from "@/lib/firebase/auth-context";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

interface PlatformUser {
  uid: string;
  email: string | null;
  role: string;
  orgId: string;
  orgName: string | null;
  platformAdmin: boolean;
  disabled: boolean;
}

function roleVariant(role: string): "default" | "secondary" | "outline" {
  if (role === "owner") return "default";
  if (role === "admin") return "secondary";
  return "outline";
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

export default function AdminUsers() {
  const { user } = useAuth();
  const [users, setUsers] = useState<PlatformUser[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = await getIdToken().catch(() => null);
    if (!token) return setLoading(false);
    try {
      const res = await fetch("/api/platform/users", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUsers(res.ok ? (await res.json()).users ?? [] : []);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  async function run(key: string, action: () => Promise<string | null>) {
    setPending(key);
    setError(null);
    const err = await action();
    if (err) setError(err);
    else await load();
    setPending(null);
  }

  const filtered = useMemo(() => {
    if (!users) return [];
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.email?.toLowerCase().includes(q) ||
        u.orgName?.toLowerCase().includes(q) ||
        u.uid.toLowerCase().includes(q)
    );
  }, [users, query]);

  // De-duplicate by uid for the action column (a user can appear under one org).
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-xl font-medium">Users</h1>
        <p className="text-sm text-muted-foreground">
          Everyone across every organization, with their org role and platform
          access.
        </p>
      </div>

      <div className="relative">
        <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by email, organization, or UID"
          className="pl-8"
        />
      </div>

      {error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <Card className="p-0">
        {loading ? (
          <div className="flex flex-col gap-3 p-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No users found.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {filtered.map((u) => {
              const isSelf = user?.uid === u.uid;
              return (
                <li
                  key={`${u.orgId}:${u.uid}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {u.email ?? u.uid}
                        </span>
                        {u.platformAdmin && (
                          <Badge variant="secondary" className="gap-1">
                            <ShieldCheck className="size-3" />
                            Admin
                          </Badge>
                        )}
                        {u.disabled && (
                          <Badge variant="destructive" className="gap-1">
                            <Ban className="size-3" />
                            Disabled
                          </Badge>
                        )}
                      </div>
                      <Link
                        href={`/admin/organizations/${u.orgId}`}
                        className="block truncate text-xs text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {u.orgName ?? u.orgId}
                      </Link>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge variant={roleVariant(u.role)}>{u.role}</Badge>
                    <Button
                      variant="outline"
                      size="xs"
                      disabled={pending !== null || (isSelf && u.platformAdmin)}
                      onClick={() =>
                        run(`admin:${u.uid}`, () =>
                          authedPost(
                            `/api/platform/users/${u.uid}/platform-admin`,
                            { grant: !u.platformAdmin }
                          )
                        )
                      }
                    >
                      {u.platformAdmin ? "Revoke admin" : "Make admin"}
                    </Button>
                    <Button
                      variant={u.disabled ? "outline" : "destructive"}
                      size="xs"
                      disabled={pending !== null || (isSelf && !u.disabled)}
                      onClick={() =>
                        run(`disabled:${u.uid}`, () =>
                          authedPost(`/api/platform/users/${u.uid}/disabled`, {
                            disabled: !u.disabled,
                          })
                        )
                      }
                    >
                      {u.disabled ? "Enable" : "Disable"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
