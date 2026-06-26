"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Bell, CheckCheck, ExternalLink, Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DOMAIN } from "@/lib/domain.config";
import {
  buildHiddenVendorSummaries,
  getNotificationsForUser,
  listVendors,
  resolveVendorByDisplayName,
  type HiddenVendorSummary,
} from "@/lib/api";
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
  const [hiddenVendors, setHiddenVendors] = useState<HiddenVendorSummary[]>([]);

  useEffect(() => {
    if (!user) return;

    function load() {
      Promise.all([
        getNotificationsForUser(user!.id),
        listKognitosRunRowsFromDb(),
        listVendors().catch(() => []),
      ])
        .then(([data, rows, vendors]) => {
          setHiddenVendors(buildHiddenVendorSummaries(vendors, rows));

          const triage = buildP2pTriageAlerts(rows, { max: 3, vendors });
          const triageNotifs: UINotification[] = triage.flatMap((t) => {
            const hit = resolveVendorByDisplayName(vendors, t.vendorName);
            if (!hit) return [];
            return [
              {
                id: t.id,
                user_id: user!.id,
                request_id: null,
                message: `[P2P Triage] ${t.message}`,
                is_read: false,
                created_at: t.createdAt,
                vendor_href: `/vendors/${hit.vendor_id}`,
                triage_meta: {
                  checkLabel: t.checkLabel,
                  invoiceNumber: t.invoiceNumber,
                  vendorName: hit.company_name,
                  materialName: t.materialName,
                  totalInvoiceValueText: t.totalInvoiceValueText,
                  recommendation: t.recommendation,
                },
              },
            ];
          });
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

      <HiddenVendorsBanner summaries={hiddenVendors} />

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

function HiddenVendorsBanner({
  summaries,
}: {
  summaries: HiddenVendorSummary[];
}) {
  const [dialogOpen, setDialogOpen] = useState(false);

  if (summaries.length === 0) return null;

  const hiddenRunTotal = summaries.reduce((sum, row) => sum + row.runCount, 0);

  return (
    <>
      <div
        role="status"
        className="flex flex-col gap-2 rounded-lg border border-border bg-muted/60 px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex gap-3">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            Some vendors have been hidden from display because they are not in
            the vendor master list ({summaries.length} supplier
            {summaries.length === 1 ? "" : "s"}, {hiddenRunTotal} run
            {hiddenRunTotal === 1 ? "" : "s"}).
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 bg-background"
          onClick={() => setDialogOpen(true)}
        >
          View hidden vendors
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Hidden vendors</DialogTitle>
            <DialogDescription>
              Raw supplier names from Kognitos runs that could not be matched to
              a record in the vendor master list.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[min(24rem,60vh)] overflow-y-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Raw vendor name</TableHead>
                  <TableHead className="w-24 text-right">Runs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summaries.map((row) => (
                  <TableRow key={row.rawName}>
                    <TableCell className="font-mono text-sm">
                      {row.rawName}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.runCount}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </>
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
