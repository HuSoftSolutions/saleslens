"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  FlaskConical,
  Store,
} from "lucide-react";
import { getIdToken } from "@/lib/firebase/auth-context";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { UsageLimitsCard } from "@/components/usage-limits-card";

export default function SettingsPage() {
  const [cloverConnected, setCloverConnected] = useState<boolean | null>(null);
  const [merchantId, setMerchantId] = useState<string | null>(null);
  const [environment, setEnvironment] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    async function checkStatus() {
      try {
        const token = await getIdToken();
        if (!token) return;
        const res = await fetch("/api/clover/status", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setCloverConnected(data.connected);
          setMerchantId(data.merchantId ?? null);
          setEnvironment(data.environment ?? null);
        }
      } catch {
        setCloverConnected(false);
      } finally {
        setLoading(false);
      }
    }
    checkStatus();
  }, []);

  async function handleConnectClover() {
    setConnecting(true);
    try {
      const token = await getIdToken();
      if (!token) return;
      window.location.href = `/api/clover/oauth/start?token=${encodeURIComponent(token)}`;
    } catch {
      setConnecting(false);
    }
  }

  async function handleDevConnect() {
    setConnecting(true);
    try {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch("/api/clover/dev-connect", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCloverConnected(true);
        setMerchantId(data.merchantId);
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Dev connect failed");
      }
    } catch {
      alert("Dev connect failed");
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your integrations and account.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Store className="size-5" />
            </span>
            <div>
              <CardTitle className="text-base">Clover integration</CardTitle>
              <CardDescription>
                Connect your Clover POS to ask questions about your data.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {loading ? (
            <Skeleton className="h-9 w-full" />
          ) : cloverConnected ? (
            <>
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3.5 py-3">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="size-5 text-primary" />
                  <div className="text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Connected</span>
                      {environment && (
                        <Badge variant="secondary" className="capitalize">
                          {environment}
                        </Badge>
                      )}
                    </div>
                    {merchantId && (
                      <span className="font-mono text-xs text-muted-foreground">
                        Merchant {merchantId}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {/* TODO: Implement disconnect flow */}
              <Button variant="outline" size="sm" disabled className="w-fit">
                Disconnect (coming soon)
              </Button>
            </>
          ) : (
            <>
              <Alert>
                <AlertDescription>
                  Connect your Clover account to start asking questions about your
                  sales, items, and refund data.
                </AlertDescription>
              </Alert>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={handleConnectClover}
                  disabled={connecting}
                >
                  <ExternalLink className="size-4" />
                  {connecting ? "Redirecting…" : "Connect with Clover"}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleDevConnect}
                  disabled={connecting}
                >
                  <FlaskConical className="size-4" />
                  {connecting ? "Connecting…" : "Dev connect (test token)"}
                </Button>
              </div>
              <Separator />
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Dev connect</span>{" "}
                uses <code className="font-mono">CLOVER_DEV_TOKEN</code> and{" "}
                <code className="font-mono">CLOVER_DEV_MERCHANT_ID</code> from your
                environment — no OAuth required.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <UsageLimitsCard />
    </div>
  );
}
