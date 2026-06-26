"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { canAccessPath, getDefaultPath } from "@/lib/role-permissions";
import { DataConnectionAlert } from "@/components/layout/data-connection-alert";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { ChatPanel } from "@/components/ui/chat-panel";
import { TimePeriodProvider } from "@/contexts/time-period-context";
import {
  SIDEBAR_MAIN_COLLAPSED_PADDING_CLASS,
  SidebarProvider,
  useSidebar,
} from "@/contexts/sidebar-context";
import { cn } from "@/lib/utils";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!canAccessPath(user.role, pathname)) {
      router.replace(getDefaultPath(user.role));
    }
  }, [user, router, pathname]);

  if (!user) {
    return null;
  }

  if (!canAccessPath(user.role, pathname)) {
    return null;
  }

  return (
    <TimePeriodProvider>
      <SidebarProvider>
        <DashboardShell>{children}</DashboardShell>
      </SidebarProvider>
    </TimePeriodProvider>
  );
}

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();

  return (
    <div className="min-h-svh bg-muted/30">
      <Sidebar />
      <div
        className={cn(
          "transition-[padding-left] duration-300 ease-in-out lg:pl-64",
          collapsed && SIDEBAR_MAIN_COLLAPSED_PADDING_CLASS,
        )}
      >
        <Topbar />
        <main className="p-4 lg:p-6">
          <div className="mb-4">
            <DataConnectionAlert />
          </div>
          {children}
        </main>
      </div>
      <ChatPanel />
    </div>
  );
}
