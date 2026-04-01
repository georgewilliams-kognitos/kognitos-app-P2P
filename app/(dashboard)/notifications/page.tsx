"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Bell, CheckCheck, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DOMAIN } from "@/lib/domain.config";
import { getNotificationsForUser, findVendorByDisplayName } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { Notification } from "@/lib/types";
import { listKognitosRunRowsFromDb } from "@/lib/api";
import { buildP2pTriageAlerts } from "@/lib/p2p-triage";
import {
  applyReadOverrides,
  setReadOverride,
} from "@/lib/notification-state";

type UINotification = Notification & {
  vendor_href?: string;
  triage_meta?: {
    checkLabel: string;
    invoiceNumber: string;
    vendorName: string;
    materialName: string;
    totalInvoiceValueText: string;
    recommendation: string;
  };
};

export default function NotificationsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<UINotification[]>([]);

  useEffect(() => {
    if (!user) return;

    function load() {
      Promise.all([getNotificationsForUser(user!.id), listKognitosRunRowsFromDb()])
        .then(async ([data, rows]) => {
          const triage = buildP2pTriageAlerts(rows, 3);
          const triageNotifs: UINotification[] = await Promise.all(
            triage.map(async (t) => {
              const hit = await findVendorByDisplayName(t.vendorName);
              return {
                id: t.id,
                user_id: user!.id,
                request_id: null,
                message: `[P2P Triage] ${t.message}`,
                is_read: false,
                created_at: t.createdAt,
                vendor_href: hit ? `/vendors/${hit.vendor_id}` : "/vendors",
                triage_meta: {
                  checkLabel: t.checkLabel,
                  invoiceNumber: t.invoiceNumber,
                  vendorName: t.vendorName,
                  materialName: t.materialName,
                  totalInvoiceValueText: t.totalInvoiceValueText,
                  recommendation: t.recommendation,
                },
              };
            }),
          );
          const merged = applyReadOverrides([...data, ...triageNotifs]).sort(
            (a, b) =>
              new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
          );
          setItems(merged);
        })
        .catch(console.error);
    }

    load();

    const onDataChanged = () => load();
    window.addEventListener("chat-data-changed", onDataChanged);
    return () => window.removeEventListener("chat-data-changed", onDataChanged);
  }, [user]);

  const unreadCount = useMemo(
    () => items.filter((n) => !n.is_read).length,
    [items],
  );

  function markAllRead() {
    setItems((prev) => {
      prev.forEach((n) => setReadOverride(n.id, true));
      return prev.map((n) => ({ ...n, is_read: true }));
    });
  }

  function toggleRead(id: string) {
    setItems((prev) =>
      prev.map((n) => {
        if (n.id !== id) return n;
        const next = !n.is_read;
        setReadOverride(id, next);
        return { ...n, is_read: next };
      }),
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
          {unreadCount > 0 && (
            <Badge className="bg-red-600 text-white">
              {unreadCount} unread
            </Badge>
          )}
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={markAllRead}
            className="gap-2"
          >
            <CheckCheck className="h-4 w-4" />
            Mark all as read
          </Button>
        )}
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="unread">
            Unread{unreadCount > 0 ? ` (${unreadCount})` : ""}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-2 pt-4">
          <NotificationList items={items} onToggleRead={toggleRead} />
        </TabsContent>

        <TabsContent value="unread" className="space-y-2 pt-4">
          <NotificationList
            items={items.filter((n) => !n.is_read)}
            onToggleRead={toggleRead}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function NotificationList({
  items,
  onToggleRead,
}: {
  items: UINotification[];
  onToggleRead: (id: string) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Bell className="mb-3 h-10 w-10" />
        <p className="text-sm">No notifications</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((n) => (
        <Card
          key={n.id}
          className={`cursor-pointer transition-colors hover:bg-muted/50 ${!n.is_read ? "border-l-4 border-l-red-500" : ""}`}
          onClick={() => onToggleRead(n.id)}
        >
          <CardContent className="flex items-start gap-4 px-5 py-4">
            <div
              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${!n.is_read ? "bg-red-500" : "bg-transparent"}`}
            />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-start justify-between gap-2">
                {n.triage_meta ? (
                  <div className="space-y-1">
                    <p
                      className={`text-sm ${!n.is_read ? "font-semibold" : "font-medium"}`}
                    >
                      {n.triage_meta.checkLabel} Failed - Invoice{" "}
                      {n.triage_meta.invoiceNumber}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Vendor: {n.triage_meta.vendorName} • Material:{" "}
                      {n.triage_meta.materialName} • Invoice Value:{" "}
                      {n.triage_meta.totalInvoiceValueText}
                    </p>
                    <p className="text-sm">{n.triage_meta.recommendation}</p>
                  </div>
                ) : (
                  <p
                    className={`text-sm ${!n.is_read ? "font-semibold" : "font-medium"}`}
                  >
                    {n.message}
                  </p>
                )}
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(n.created_at), {
                    addSuffix: true,
                  })}
                </span>
              </div>
              {n.request_id && (
                <Link
                  href={`/${DOMAIN.entitySlug}/${n.request_id}`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-red-500 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  View {DOMAIN.entity.singular.toLowerCase()}
                  <ExternalLink className="h-3 w-3" />
                </Link>
              )}
              {n.vendor_href && (
                <Link
                  href={n.vendor_href}
                  className="inline-flex items-center gap-1 text-xs font-medium text-red-500 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  Open vendor
                  <ExternalLink className="h-3 w-3" />
                </Link>
              )}
              <div className="pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleRead(n.id);
                  }}
                >
                  Mark as {n.is_read ? "unread" : "read"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
