"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { signOut } from "firebase/auth";
import { LayoutDashboard, MessageSquareText, Settings, LogOut, ShieldCheck } from "lucide-react";
import { getClientAuth } from "@/lib/firebase/client";
import { AuthProvider, useAuth } from "@/lib/firebase/auth-context";
import { usePlatformAdmin } from "@/lib/platform/usePlatformAdmin";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/app", label: "Dashboard", icon: LayoutDashboard },
  { href: "/app/chat", label: "Chat", icon: MessageSquareText },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { isAdmin } = usePlatformAdmin();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3">
        <Skeleton className="size-9 rounded-lg" />
        <Skeleton className="h-3 w-32" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-2 sm:gap-6">
            <Link href="/app" className="shrink-0">
              <Brand />
            </Link>
            <nav className="flex items-center gap-1">
              {navItems.map((item) => {
                const active =
                  item.href === "/app"
                    ? pathname === "/app"
                    : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
                      active
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Icon className="size-4" />
                    <span className="hidden sm:inline">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-1.5">
            {isAdmin && (
              <Button
                variant="ghost"
                size="sm"
                nativeButton={false}
                render={<Link href="/admin" />}
              >
                <ShieldCheck className="size-4" />
                <span className="hidden md:inline">Admin</span>
              </Button>
            )}
            <span className="hidden text-xs text-muted-foreground md:inline">
              {user.email}
            </span>
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => signOut(getClientAuth())}
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AppShell>{children}</AppShell>
    </AuthProvider>
  );
}
