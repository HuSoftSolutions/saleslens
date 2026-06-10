"use client";

import { useEffect, useState } from "react";
import {
  Store,
  Plus,
  Trash2,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { getIdToken } from "@/lib/firebase/auth-context";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Merchant {
  merchantId: string;
  name: string | null;
  status: "active" | "error";
  environment: string;
  source: "oauth" | "token";
  timezone: string | null;
}

export function LocationsCard() {
  const [merchants, setMerchants] = useState<Merchant[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [mId, setMId] = useState("");
  const [token, setToken] = useState("");
  const [env, setEnv] = useState("sandbox");
  const [bulkText, setBulkText] = useState("");
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  async function authedFetch(url: string, init?: RequestInit) {
    const t = await getIdToken();
    return fetch(url, {
      ...init,
      headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${t}` },
    });
  }

  async function load() {
    try {
      const res = await authedFetch("/api/clover/merchants");
      if (res.ok) setMerchants((await res.json()).merchants ?? []);
      else setMerchants([]);
    } catch {
      setMerchants([]);
    }
  }

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    load();
    // Surface OAuth callback errors (?error=...) from the redirect.
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err) setError(`Clover connection failed: ${err.replace(/_/g, " ")}`);
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function connectOAuth() {
    setBusy(true);
    const t = await getIdToken();
    if (!t) return setBusy(false);
    window.location.href = `/api/clover/oauth/start?token=${encodeURIComponent(t)}`;
  }

  async function devConnect() {
    setBusy(true);
    setError(null);
    try {
      const res = await authedFetch("/api/clover/dev-connect", { method: "POST" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Dev connect failed");
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function addViaToken() {
    if (!mId.trim() || !token.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await authedFetch("/api/clover/merchants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchantId: mId.trim(), accessToken: token.trim(), environment: env }),
      });
      if (res.ok) {
        setMId("");
        setToken("");
        setShowForm(false);
        await load();
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Could not add location");
      }
    } finally {
      setBusy(false);
    }
  }

  async function bulkAdd() {
    // Parse lines like "MerchantID,token" (also accepts whitespace/colon separators).
    const entries = bulkText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [merchantId, accessToken] = l.split(/[\s,:]+/).filter(Boolean);
        return { merchantId, accessToken };
      })
      .filter((e) => e.merchantId && e.accessToken);

    if (entries.length === 0) {
      setError("Paste one MerchantID,token per line.");
      return;
    }
    setBusy(true);
    setError(null);
    setBulkMsg(null);
    try {
      const res = await authedFetch("/api/clover/merchants/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries, environment: env }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error ?? "Bulk add failed");
      } else {
        const failed = (d.results ?? []).filter(
          (r: { ok: boolean }) => !r.ok
        );
        setBulkMsg(
          `Added ${d.added}/${d.total} location(s).` +
            (failed.length
              ? ` Failed: ${failed.map((f: { merchantId: string }) => f.merchantId).join(", ")} (check ID, token, environment).`
              : "")
        );
        if (d.added > 0) setBulkText("");
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function syncNow(target: string) {
    setSyncingId(target);
    setSyncMsg(null);
    setError(null);
    try {
      const res = await authedFetch("/api/clover/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          days: 90,
          merchantId: target === "all" ? undefined : target,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error ?? "Sync failed");
      } else {
        setSyncMsg(
          `Synced ${d.merchants} location(s): ${d.orders?.toLocaleString()} orders, ${d.payments?.toLocaleString()} payments into the warehouse.` +
            (d.errors?.length ? ` ${d.errors.length} failed (check tokens).` : "")
        );
        await load();
      }
    } finally {
      setSyncingId(null);
    }
  }

  async function disconnect(merchantId: string) {
    if (!confirm("Disconnect this location?")) return;
    setBusy(true);
    try {
      await authedFetch(`/api/clover/merchants/${encodeURIComponent(merchantId)}`, {
        method: "DELETE",
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  const count = merchants?.length ?? 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Store className="size-5" />
            </span>
            <div>
              <CardTitle className="text-base">
                Locations{count ? ` (${count})` : ""}
              </CardTitle>
              <CardDescription>
                Connect each Clover location. Production uses OAuth per location;
                add sandbox test merchants by token to reproduce the setup.
              </CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {merchants === null ? (
          <Skeleton className="h-12 w-full" />
        ) : merchants.length === 0 ? (
          <Alert>
            <AlertDescription>
              No locations connected yet. Connect with Clover (OAuth) or add a
              sandbox test merchant by token below.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="flex flex-col gap-2">
            {merchants.map((m) => (
              <div
                key={m.merchantId}
                className="flex items-center justify-between gap-3 rounded-lg border border-border px-3.5 py-3"
              >
                <div className="flex items-center gap-3">
                  {m.status === "active" ? (
                    <CheckCircle2 className="size-5 text-primary" />
                  ) : (
                    <AlertTriangle className="size-5 text-destructive" />
                  )}
                  <div className="text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{m.name ?? "Clover merchant"}</span>
                      <Badge variant="secondary" className="capitalize">{m.environment}</Badge>
                      <Badge variant="secondary" className="uppercase">{m.source}</Badge>
                    </div>
                    <span className="font-mono text-xs text-muted-foreground">
                      {m.merchantId}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => syncNow(m.merchantId)}
                    disabled={busy || syncingId !== null}
                    title="Pull this location's Clover data into the warehouse"
                  >
                    <RefreshCw
                      className={cn("size-3.5", syncingId === m.merchantId && "animate-spin")}
                    />
                    {syncingId === m.merchantId ? "Syncing…" : "Sync"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => disconnect(m.merchantId)}
                    disabled={busy || syncingId !== null}
                    aria-label="Disconnect location"
                    title="Disconnect"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={connectOAuth} disabled={busy}>
            <ExternalLink className="size-4" />
            Connect with Clover (OAuth)
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setShowForm((s) => !s)} disabled={busy}>
            <Plus className="size-4" />
            Add by token
          </Button>
          <Button size="sm" variant="ghost" onClick={devConnect} disabled={busy}>
            Use .env dev token
          </Button>
          {count > 1 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => syncNow("all")}
              disabled={busy || syncingId !== null}
            >
              <RefreshCw className={cn("size-4", syncingId === "all" && "animate-spin")} />
              {syncingId === "all" ? "Syncing…" : "Sync all"}
            </Button>
          )}
        </div>

        {syncMsg && (
          <Alert>
            <AlertDescription>{syncMsg}</AlertDescription>
          </Alert>
        )}

        {/* Add-by-token form (sandbox reproduction of multi-location) */}
        {showForm && (
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3.5">
            <p className="text-xs text-muted-foreground">
              Create a test merchant in your sandbox dashboard, generate an API
              token, and paste its Merchant ID + token here to add it as a location.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="mid">Merchant ID</Label>
                <Input id="mid" value={mId} onChange={(e) => setMId(e.target.value)} placeholder="JPM6B6SHHNT61" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="env">Environment</Label>
                <select
                  id="env"
                  value={env}
                  onChange={(e) => setEnv(e.target.value)}
                  className="h-9 rounded-md border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring dark:bg-input/30"
                >
                  <option value="sandbox">sandbox</option>
                  <option value="production">production</option>
                </select>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tok">API token</Label>
              <Input id="tok" value={token} onChange={(e) => setToken(e.target.value)} placeholder="xxxxxxxx-xxxx-…" />
            </div>
            <Button size="sm" onClick={addViaToken} disabled={busy || !mId.trim() || !token.trim()} className="w-fit">
              {busy ? "Adding…" : "Add location"}
            </Button>

            {/* Bulk: paste several at once (e.g. all locations of one business) */}
            <div className="mt-1 flex flex-col gap-1.5 border-t border-border/60 pt-3">
              <Label htmlFor="bulk">Or add several at once</Label>
              <p className="text-xs text-muted-foreground">
                One per line: <code className="font-mono">MerchantID,token</code> — uses the Environment selected above.
              </p>
              <Textarea
                id="bulk"
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                rows={4}
                placeholder={"JPM6B6SHHNT61,xxxxxxxx-xxxx-…\n9KA2…,yyyyyyyy-yyyy-…"}
                className="font-mono text-xs"
              />
              <Button
                size="sm"
                onClick={bulkAdd}
                disabled={busy || !bulkText.trim()}
                className="w-fit"
              >
                {busy ? "Adding…" : "Add all"}
              </Button>
              {bulkMsg && (
                <p className="text-xs text-muted-foreground">{bulkMsg}</p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
