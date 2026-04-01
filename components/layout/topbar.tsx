"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, LogOut, RefreshCw, Search, User as UserIcon } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { DOMAIN, getRoleConfig } from "@/lib/domain.config";
import { listVendors } from "@/lib/api";
import type { Vendor } from "@/lib/types";
import { queryUnreadNotificationCount } from "@/lib/queries";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MobileSidebar } from "./sidebar";

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function Topbar() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [searchValue, setSearchValue] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [syncingKognitos, setSyncingKognitos] = useState(false);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [showVendorDropdown, setShowVendorDropdown] = useState(false);

  useEffect(() => {
    listVendors().then(setVendors).catch(console.error);
  }, []);

  useEffect(() => {
    if (user) {
      queryUnreadNotificationCount(user.id).then(setUnreadCount);
    }
  }, [user]);

  function handleLogout() {
    logout();
    router.push("/login");
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      const q = searchValue.trim().toLowerCase();
      const hit = vendors.find((v) => v.company_name.toLowerCase().includes(q));
      if (hit) {
        setShowVendorDropdown(false);
        router.push(`/vendors/${hit.vendor_id}`);
      } else {
        router.push("/vendors");
      }
    }
  }

  const filteredVendors = vendors
    .filter((v) =>
      v.company_name.toLowerCase().includes(searchValue.trim().toLowerCase()),
    )
    .slice(0, 8);

  const roleConfig = user ? getRoleConfig(user.role) : undefined;

  async function handleKognitosRefresh() {
    setSyncingKognitos(true);
    try {
      const res = await fetch("/api/kognitos/sync", { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as {
        written?: boolean;
        newRuns?: number;
        mode?: "full" | "incremental";
        sinceCreateTime?: string | null;
        fetchedFromKognitos?: number;
        skippedAlreadyInDb?: number;
        message?: string;
        error?: string;
      };
      if (!res.ok) {
        window.alert(
          json.message ?? json.error ?? `Kognitos sync failed (${res.status})`,
        );
        return;
      }
      const fetched = json.fetchedFromKognitos ?? 0;
      const skipped = json.skippedAlreadyInDb ?? 0;
      const modeLabel =
        json.mode === "full"
          ? "full history backfill"
          : "incremental (runs on/after latest stored create_time)";
      const msg =
        json.written === false
          ? `Kognitos sync (${modeLabel}): ${fetched} run(s) from API, ${skipped} already in Supabase — no new rows.`
          : `Imported ${json.newRuns ?? 0} new run(s) (${modeLabel}). ${fetched} fetched, ${skipped} skipped as duplicates.`;
      window.alert(msg);
      window.dispatchEvent(new Event("chat-data-changed"));
    } finally {
      setSyncingKognitos(false);
    }
  }

  return (
    <TooltipProvider>
      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-background/95 px-4 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/60 lg:px-6">
        <MobileSidebar />

        <div className="flex-1 flex items-center justify-center lg:justify-start">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search vendors..."
              className="w-full pl-9 h-9"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              onFocus={() => setShowVendorDropdown(true)}
              onBlur={() => setTimeout(() => setShowVendorDropdown(false), 120)}
            />
            {showVendorDropdown && searchValue.trim().length > 0 && (
              <div className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md">
                {filteredVendors.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    No vendors found
                  </div>
                ) : (
                  filteredVendors.map((vendor) => (
                    <button
                      key={vendor.vendor_id}
                      type="button"
                      className="w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setSearchValue(vendor.company_name);
                        setShowVendorDropdown(false);
                        router.push(`/vendors/${vendor.vendor_id}`);
                      }}
                    >
                      {vendor.company_name}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                disabled={syncingKognitos}
                onClick={() => void handleKognitosRefresh()}
                aria-label="Refresh Kognitos runs"
              >
                <RefreshCw
                  className={`size-[18px] ${syncingKognitos ? "animate-spin" : ""}`}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh Kognitos (import new runs)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="relative"
                onClick={() => router.push("/notifications")}
              >
                <Bell className="size-[18px]" />
                {unreadCount > 0 && (
                  <Badge
                    variant="destructive"
                    className="absolute -right-0.5 -top-0.5 flex size-5 items-center justify-center rounded-full p-0 text-[10px] font-medium"
                  >
                    {unreadCount}
                  </Badge>
                )}
                <span className="sr-only">Notifications</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Notifications</TooltipContent>
          </Tooltip>

          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="relative flex items-center gap-2 px-2"
                >
                  <Avatar className="size-8">
                    <AvatarFallback className="bg-brand/20 text-xs font-medium">
                      {getInitials(user.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden text-sm font-medium sm:inline-block">
                    {user.full_name}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium">{user.full_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {user.email}
                    </p>
                    <Badge variant="outline" className="mt-1 w-fit text-[10px]">
                      {roleConfig?.label ?? user.role}
                    </Badge>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push("/settings")}>
                  <UserIcon className="mr-2 size-4" />
                  Profile &amp; Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} variant="destructive">
                  <LogOut className="mr-2 size-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </header>
    </TooltipProvider>
  );
}
