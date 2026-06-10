"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { signOut } from "firebase/auth";
import { LayoutDashboard, Building2, Users, ScrollText, LogOut, ArrowLeft } from "lucide-react";
import { getClientAuth } from "@/lib/firebase/client";
import { AuthProvider, useAuth } from "@/lib/firebase/auth-context";
import { usePlatformAdmin } from "@/lib/platform/usePlatformAdmin";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/organizations", label: "Organizations", icon: Building2 },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/audit", label: "Audit", icon: ScrollText },
];

function AdminShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { isAdmin, checking } = usePlatformAdmin();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading || checking) return;
    if (!user) {
      router.replace("/login");
    } else if (!isAdmin) {
      // Authenticated but not a platform admin — bounce to the customer app.
      router.replace("/app");
    }
  }, [user, loading, isAdmin, checking, router]);

  if (loading || checking || !user || !isAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3">
        <Skeleton className="size-9 rounded-lg" />
        <Skeleton className="h-3 w-32" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-2 sm:gap-6">
            <Link href="/admin" className="flex shrink-0 items-center gap-2">
              <Brand />
              <Badge variant="secondary" className="hidden sm:inline-flex">
                Admin
              </Badge>
            </Link>
            <nav className="flex items-center gap-1">
              {navItems.map((item) => {
                const active =
                  item.href === "/admin"
                    ? pathname === "/admin"
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
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={<Link href="/app" />}
            >
              <ArrowLeft className="size-4" />
              <span className="hidden md:inline">Exit admin</span>
            </Button>
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
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AdminShell>{children}</AdminShell>
    </AuthProvider>
  );
}
