"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardList,
  BarChart3,
  Bell,
  Settings,
  Building2,
  Layers,
  Menu,
  FileText,
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { DOMAIN, getRoleConfig } from "@/lib/domain.config";
import { canAccessPath } from "@/lib/role-permissions";
import {
  SIDEBAR_COLLAPSED_WIDTH_CLASS,
  useSidebar,
} from "@/contexts/sidebar-context";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const ICON_MAP: Record<string, LucideIcon> = {
  ClipboardList,
  BarChart3,
  Bell,
  Settings,
  Building2,
  Layers,
  FileText,
};

const LogoIcon = ICON_MAP[DOMAIN.appLogo] ?? Layers;

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function SidebarNavItem({
  href,
  label,
  icon: Icon,
  active,
  collapsed,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  collapsed: boolean;
}) {
  const link = (
    <Link
      href={href}
      aria-label={collapsed ? label : undefined}
      className={cn(
        "flex w-full items-center rounded-md text-sm font-medium transition-colors",
        collapsed ? "justify-center px-0 py-2" : "gap-3 px-3 py-2",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
      )}
    >
      <Icon className="size-[18px] shrink-0" aria-hidden />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );

  if (!collapsed) {
    return link;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={10}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function SidebarNav({ collapsed = false }: { collapsed?: boolean }) {
  const pathname = usePathname();
  const { user } = useAuth();

  const visibleItems = DOMAIN.navItems.filter((item) => {
    if (item.roles && user && !item.roles.includes(user.role)) return false;
    if (user && !canAccessPath(user.role, item.href)) return false;
    return true;
  });

  const roleConfig = user ? getRoleConfig(user.role) : undefined;

  const nav = (
    <div className="flex h-full flex-col overflow-visible bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      <div
        className={cn(
          "flex h-16 shrink-0 items-center border-b border-sidebar-border",
          collapsed ? "justify-center px-0" : "gap-2.5 px-5",
        )}
      >
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand text-primary-foreground">
                <LogoIcon className="size-4" aria-hidden />
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={10}>
              {DOMAIN.appName}
            </TooltipContent>
          </Tooltip>
        ) : (
          <>
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand text-primary-foreground">
              <LogoIcon className="size-4" />
            </div>
            <span className="min-w-0 flex-1 truncate text-base font-semibold tracking-normal">
              {DOMAIN.appName}
            </span>
          </>
        )}
      </div>

      <nav
        className={cn(
          "flex-1 space-y-0.5 overflow-visible py-4",
          collapsed ? "px-0" : "px-3",
        )}
      >
        {visibleItems.map((item) => {
          const Icon = ICON_MAP[item.icon] ?? Layers;
          return (
            <SidebarNavItem
              key={item.href}
              href={item.href}
              label={item.label}
              icon={Icon}
              active={isActive(pathname, item.href)}
              collapsed={collapsed}
            />
          );
        })}
      </nav>

      {user && (
        <div
          className={cn(
            "border-t border-sidebar-border",
            collapsed ? "flex justify-center px-0 py-3" : "p-4",
          )}
        >
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Avatar className="size-8 shrink-0">
                  <AvatarFallback className="bg-brand/20 text-xs font-medium">
                    {getInitials(user.full_name)}
                  </AvatarFallback>
                </Avatar>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={10} className="max-w-[200px]">
                <p className="font-medium">{user.full_name}</p>
                <p className="text-xs text-muted-foreground">
                  {roleConfig?.label ?? user.role}
                </p>
              </TooltipContent>
            </Tooltip>
          ) : (
            <div className="flex items-center gap-3">
              <Avatar className="size-9 shrink-0">
                <AvatarFallback className="bg-brand/20 text-xs font-medium">
                  {getInitials(user.full_name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{user.full_name}</p>
                <Badge variant="secondary" className="mt-0.5 text-[10px]">
                  {roleConfig?.label ?? user.role}
                </Badge>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (collapsed) {
    return <TooltipProvider delayDuration={200}>{nav}</TooltipProvider>;
  }

  return nav;
}

export function Sidebar() {
  const { collapsed, toggleCollapsed } = useSidebar();

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-30 hidden h-full overflow-visible transition-[width] duration-300 ease-in-out lg:block",
        collapsed ? SIDEBAR_COLLAPSED_WIDTH_CLASS : "w-64",
      )}
    >
      <SidebarNav collapsed={collapsed} />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={cn(
            "absolute top-[3.25rem] z-40 size-7 rounded-full border-sidebar-border bg-background shadow-sm",
            collapsed ? "-right-3.5" : "-right-3.5",
          )}
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="size-4" />
          ) : (
            <ChevronLeft className="size-4" />
          )}
        </Button>
    </aside>
  );
}

export function MobileSidebar() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden">
          <Menu className="size-5" />
          <span className="sr-only">Open sidebar</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0" showCloseButton={false}>
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <SidebarNav />
      </SheetContent>
    </Sheet>
  );
}
