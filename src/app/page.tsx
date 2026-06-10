import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Clock,
  Layers,
  MessageSquareText,
  PlugZap,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Brand } from "@/components/brand";
import { APP_NAME } from "@/lib/brand";

const STEPS = [
  {
    icon: PlugZap,
    title: "Connect your Clover account",
    desc: "Securely link your Clover POS in a click. Multi-location businesses connect every location.",
  },
  {
    icon: MessageSquareText,
    title: "Ask in plain English",
    desc: "“How did this week compare to last?” “Which bays are busiest?” No reports to build.",
  },
  {
    icon: Sparkles,
    title: "Get instant answers",
    desc: "Numbers, tables, and charts in seconds — grounded in your real sales data.",
  },
];

const FEATURES = [
  { icon: MessageSquareText, title: "Plain-English chat", desc: "Ask anything about sales, items, refunds, and trends — get an answer, not a dashboard to configure." },
  { icon: Layers, title: "Multi-location", desc: "Roll every location up into one view, or drill into a single store. Compare locations instantly." },
  { icon: Target, title: "Built for your business", desc: "Track food & beverage and bookable services side by side, with category-level revenue breakdowns." },
  { icon: BarChart3, title: "Charts & comparisons", desc: "Period-over-period changes and visual breakdowns rendered right in the conversation." },
  { icon: Clock, title: "Peak-time insights", desc: "See your busiest hours and when demand spikes so you can staff and price smarter." },
  { icon: ShieldCheck, title: "Private & cost-controlled", desc: "Your data stays yours. Per-user limits and guardrails keep usage predictable." },
];

export default function Home() {
  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black,transparent_55%)] opacity-50" />

      {/* Header */}
      <header className="relative z-10 mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
        <Brand />
        <div className="flex items-center gap-2">
          <Link href="/login">
            <Button size="sm">Sign in</Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="relative z-10 mx-auto w-full max-w-6xl flex-1 px-4">
        <section className="flex flex-col items-center gap-6 py-16 text-center sm:py-24">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-primary" />
            AI analytics for Clover POS
          </span>
          <h1 className="font-heading max-w-3xl text-5xl font-semibold tracking-tight text-balance sm:text-6xl">
            Understand your business, just by asking.
          </h1>
          <p className="max-w-xl text-balance text-muted-foreground sm:text-lg">
            Connect your Clover account and get instant, plain-English answers about
            sales, top items, busy hours, and revenue — across every location. No
            spreadsheets, no report builders.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href="/login">
              <Button size="lg">
                Sign in
                <ArrowRight className="size-4" />
              </Button>
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">
            Works with Clover · Access by invitation
          </p>

          {/* Product preview */}
          <div className="mt-8 w-full max-w-3xl">
            <ProductPreview />
          </div>
        </section>

        {/* How it works */}
        <section className="border-t border-border py-16">
          <h2 className="text-center text-sm font-semibold tracking-tight text-muted-foreground">
            HOW IT WORKS
          </h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, desc }, i) => (
              <div key={title} className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </span>
                  <span className="text-xs font-medium text-muted-foreground">
                    Step {i + 1}
                  </span>
                </div>
                <h3 className="text-base font-semibold tracking-tight">{title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="border-t border-border py-16">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              Everything you need to run on the numbers
            </h2>
            <p className="mt-3 text-muted-foreground">
              Answers your team will actually use — without learning a BI tool.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="flex flex-col gap-2 rounded-xl border border-border bg-card p-5"
              >
                <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </span>
                <h3 className="mt-1 text-sm font-semibold">{title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="py-16">
          <div className="flex flex-col items-center gap-5 rounded-2xl border border-border bg-card px-6 py-12 text-center">
            <h2 className="font-heading max-w-xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              Stop digging through reports. Just ask.
            </h2>
            <Link href="/login">
              <Button size="lg">
                Sign in
                <ArrowRight className="size-4" />
              </Button>
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <Brand />
          <p className="max-w-xl sm:text-right">
            Clover is a trademark of Clover Network, LLC. {APP_NAME} is an
            independent product and is not affiliated with, endorsed by, or sponsored
            by Clover Network, LLC or Fiserv. © {APP_NAME}.
          </p>
        </div>
      </footer>
    </div>
  );
}

/** A lightweight, static product preview (no data) for the hero. */
function ProductPreview() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card text-left shadow-xl ring-1 ring-foreground/5">
      <div className="flex items-center gap-1.5 border-b border-border/80 px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-destructive/50" />
        <span className="size-2.5 rounded-full bg-chart-4/60" />
        <span className="size-2.5 rounded-full bg-chart-3/60" />
        <span className="ml-2 text-xs text-muted-foreground">{APP_NAME} — Chat</span>
      </div>
      <div className="flex flex-col gap-4 p-5">
        {/* stat tiles */}
        <div className="grid grid-cols-3 gap-3">
          {[
            ["Sales today", "$8,420"],
            ["This week", "+12.4%"],
            ["Top item", "Smash Burger"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-border bg-background/60 p-3">
              <p className="text-[11px] text-muted-foreground">{label}</p>
              <p className="mt-0.5 truncate text-sm font-semibold">{value}</p>
            </div>
          ))}
        </div>
        {/* faux chat */}
        <div className="flex justify-end">
          <div className="rounded-2xl rounded-tr-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground">
            How does simulator revenue compare to food &amp; drinks?
          </div>
        </div>
        <div className="flex gap-2.5">
          <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <BarChart3 className="size-3.5" />
          </span>
          <div className="flex-1 rounded-2xl rounded-tl-sm bg-muted p-3 text-sm">
            <p className="mb-2">This week, food &amp; beverage led, with simulator bookings close behind:</p>
            <div className="flex flex-col gap-1.5">
              {[
                ["Food", 92],
                ["Drinks", 40],
                ["Sim Time", 33],
              ].map(([label, pct]) => (
                <div key={label as string} className="flex items-center gap-2 text-xs">
                  <span className="w-16 text-muted-foreground">{label}</span>
                  <span className="relative h-3 flex-1 overflow-hidden rounded bg-background">
                    <span
                      className="absolute inset-y-0 left-0 rounded bg-primary"
                      style={{ width: `${pct as number}%` }}
                    />
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
