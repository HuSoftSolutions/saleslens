"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock,
  DollarSign,
  MapPin,
  MessageSquareText,
  PlugZap,
  RefreshCcw,
  ShoppingBag,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { getIdToken } from "@/lib/firebase/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const SUGGESTED = [
  "What were my total sales today?",
  "What are my top selling items this week?",
  "How do this week's sales compare to last week?",
  "What hours am I busiest?",
];

const CAPABILITIES = [
  { icon: TrendingUp, title: "Sales summaries", desc: "Gross sales, payment counts, average ticket, tips, and tax for any date range." },
  { icon: ShoppingBag, title: "Top selling items", desc: "See which menu items move the most by quantity and revenue." },
  { icon: BarChart3, title: "Period comparisons", desc: "Compare two periods side by side with percentage changes." },
  { icon: Clock, title: "Sales by hour", desc: "Find your busiest hours and how items sell across the day." },
  { icon: RefreshCcw, title: "Refund insights", desc: "Track refund counts and totals over any window." },
];

interface Overview {
  connected: boolean;
  today?: { grossTotal: number; paymentCount: number };
  week?: { grossTotal: number; deltaPct: number };
  topItem?: { name: string; quantity: number } | null;
  topLocation?: { name: string; grossSales: number } | null;
}

const money = (n: number) =>
  "$" + n.toLocaleString(undefined, { maximumFractionDigits: 0 });

export default function AppHome() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [merchantId, setMerchantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [kpi, setKpi] = useState<Overview | null>(null);
  const [kpiLoading, setKpiLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await getIdToken().catch(() => null);
      if (!token) {
        setLoading(false);
        setKpiLoading(false);
        return;
      }
      const headers = { Authorization: `Bearer ${token}` };

      fetch("/api/clover/status", { headers })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d) {
            setConnected(d.connected);
            setMerchantId(d.merchantId ?? null);
          }
        })
        .catch(() => setConnected(false))
        .finally(() => setLoading(false));

      fetch("/api/analytics/overview", { headers })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => setKpi(d))
        .catch(() => setKpi(null))
        .finally(() => setKpiLoading(false));
    })();
  }, []);

  const delta = kpi?.week?.deltaPct ?? 0;
  const deltaUp = delta >= 0;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ask plain-English questions about your Clover business data.
        </p>
      </div>

      {/* KPI tiles */}
      {kpiLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : kpi?.connected ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            icon={DollarSign}
            label="Sales today"
            value={money(kpi.today?.grossTotal ?? 0)}
            sub={`${kpi.today?.paymentCount ?? 0} payments`}
          />
          <StatTile
            icon={TrendingUp}
            label="This week"
            value={money(kpi.week?.grossTotal ?? 0)}
            sub={
              <span
                className={deltaUp ? "text-emerald-500" : "text-destructive"}
              >
                {deltaUp ? (
                  <TrendingUp className="mr-1 inline size-3" />
                ) : (
                  <TrendingDown className="mr-1 inline size-3" />
                )}
                {deltaUp ? "+" : ""}
                {delta.toFixed(1)}% vs last week
              </span>
            }
          />
          <StatTile
            icon={ShoppingBag}
            label="Top item (7d)"
            value={kpi.topItem?.name ?? "—"}
            sub={kpi.topItem ? `${kpi.topItem.quantity.toLocaleString()} sold` : ""}
          />
          <StatTile
            icon={MapPin}
            label="Top location (7d)"
            value={kpi.topLocation?.name ?? "—"}
            sub={kpi.topLocation ? money(kpi.topLocation.grossSales) : ""}
          />
        </div>
      ) : null}

      {/* Connection status */}
      <Card className="overflow-hidden">
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span
              className={
                connected
                  ? "flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary"
                  : "flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground"
              }
            >
              {connected ? (
                <CheckCircle2 className="size-5" />
              ) : (
                <PlugZap className="size-5" />
              )}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Clover connection</span>
                {loading ? (
                  <Skeleton className="h-4 w-20" />
                ) : connected ? (
                  <Badge variant="default">Connected</Badge>
                ) : (
                  <Badge variant="secondary">Not connected</Badge>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {loading
                  ? "Checking integration…"
                  : connected
                    ? `Merchant ${merchantId ?? "—"}`
                    : "Connect your POS to start asking questions."}
              </p>
            </div>
          </div>
          <Link href="/app/settings" className="shrink-0">
            <Button variant={connected ? "outline" : "default"} size="sm">
              {connected ? "Manage" : "Connect Clover"}
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* Ask anything */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <h2 className="text-sm font-semibold tracking-tight">Ask anything</h2>
          </div>
          <Link href="/app/chat">
            <Button variant="ghost" size="sm">
              Open chat
              <ArrowRight className="size-4" />
            </Button>
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {SUGGESTED.map((q) => (
            <Link key={q} href={`/app/chat?q=${encodeURIComponent(q)}`}>
              <Card className="group h-full cursor-pointer py-0 transition-colors hover:bg-accent/40 hover:ring-primary/40">
                <CardContent className="flex items-center justify-between gap-3 px-4 py-3.5">
                  <span className="flex items-center gap-2.5 text-sm">
                    <MessageSquareText className="size-4 shrink-0 text-muted-foreground" />
                    {q}
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* Capabilities */}
      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold tracking-tight">
          What you can explore
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map(({ icon: Icon, title, desc }) => (
            <Card key={title} className="py-0">
              <CardContent className="flex flex-col gap-2 p-4">
                <span className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Icon className="size-4" />
                </span>
                <span className="text-sm font-medium">{title}</span>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {desc}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub: React.ReactNode;
}) {
  return (
    <Card className="py-0">
      <CardContent className="flex flex-col gap-1 p-4">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icon className="size-3.5" />
          {label}
        </span>
        <span className="truncate text-xl font-semibold tracking-tight" title={value}>
          {value}
        </span>
        <span className="truncate text-xs text-muted-foreground">{sub}</span>
      </CardContent>
    </Card>
  );
}
