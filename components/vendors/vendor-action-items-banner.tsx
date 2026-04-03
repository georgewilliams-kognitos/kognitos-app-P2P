"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { getReadOverrides, setReadOverride } from "@/lib/notification-state";
import {
  failedCheckSectionTitle,
  TRIAGE_CHECK_ORDER,
  type TriageAlert,
  type TriageCheckKey,
} from "@/lib/p2p-triage";
import type { Vendor } from "@/lib/types";
import {
  buildVendorTriageConsolidatedDraftEmail,
  getVendorActionDetailLine,
} from "@/lib/vendor-triage-email";

const currencyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** Parse triage display string like "$1,234.56" or "N/A". */
function parseUsdFromTriageDisplay(s: string): number | null {
  if (!s?.trim() || s === "N/A") return null;
  const n = Number.parseFloat(s.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Distinct invoices, combined USD, and deduped material+qty lines with occurrence counts. */
function summarizeVendorFailureGroup(items: TriageAlert[]) {
  const distinctInvoices = new Set(
    items
      .map((a) => a.invoiceNumber.trim())
      .filter((s) => s.length > 0)
      .map((s) => s.toLowerCase()),
  );
  const invoiceCount =
    distinctInvoices.size > 0 ? distinctInvoices.size : items.length;

  let combinedUsd = 0;
  let anyAmount = false;
  for (const a of items) {
    const v = parseUsdFromTriageDisplay(a.totalInvoiceValueText);
    if (v != null) {
      combinedUsd += v;
      anyAmount = true;
    }
  }

  const pairCounts = new Map<string, number>();
  for (const a of items) {
    const mat = a.materialName.trim() || "Unknown material";
    const qty = a.quantityText.trim() || "—";
    const key = `${mat}\u0000${qty}`;
    pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
  }

  const materialLines = [...pairCounts.entries()]
    .map(([key, count]) => {
      const [material, qty] = key.split("\u0000");
      return { material, qty, count };
    })
    .sort((a, b) => a.material.localeCompare(b.material, "en"));

  return {
    invoiceCount,
    combinedUsd: anyAmount ? combinedUsd : null,
    materialLines,
  };
}

function groupAlertsByCheck(alerts: TriageAlert[]) {
  const map = new Map<TriageCheckKey, TriageAlert[]>();
  for (const key of TRIAGE_CHECK_ORDER) map.set(key, []);
  for (const a of alerts) {
    const list = map.get(a.checkKey);
    if (list) list.push(a);
  }
  return TRIAGE_CHECK_ORDER.map((key) => ({
    key,
    title: failedCheckSectionTitle(key),
    items: map.get(key) ?? [],
  })).filter((g) => g.items.length > 0);
}

export function VendorActionItemsBanner({
  vendor,
  alerts,
}: {
  vendor: Vendor;
  alerts: TriageAlert[];
}) {
  const [unread, setUnread] = useState<TriageAlert[]>([]);
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftText, setDraftText] = useState({ subject: "", body: "" });
  const [copied, setCopied] = useState(false);

  const syncUnread = useCallback(() => {
    const o = getReadOverrides();
    setUnread(alerts.filter((a) => !o[a.id]));
  }, [alerts]);

  useEffect(() => {
    syncUnread();
  }, [syncUnread]);

  useEffect(() => {
    const onChange = () => syncUnread();
    window.addEventListener("kognitos-read-overrides-changed", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("kognitos-read-overrides-changed", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [syncUnread]);

  const grouped = useMemo(() => groupAlertsByCheck(unread), [unread]);

  const markFailureTypeAsRead = useCallback(
    (items: TriageAlert[]) => {
      for (const a of items) {
        setReadOverride(a.id, true);
      }
      syncUnread();
    },
    [syncUnread],
  );

  function openDraftForSection(
    checkKey: TriageCheckKey,
    items: TriageAlert[],
  ) {
    const { subject, body } = buildVendorTriageConsolidatedDraftEmail(
      items,
      vendor,
      checkKey,
    );
    setDraftText({ subject, body });
    setCopied(false);
    setDraftOpen(true);
  }

  async function copyBody() {
    try {
      await navigator.clipboard.writeText(
        `Subject: ${draftText.subject}\n\n${draftText.body}`,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const mailtoHref =
    vendor.primary_contact_email?.trim() && draftText.subject
      ? `mailto:${encodeURIComponent(vendor.primary_contact_email.trim())}?subject=${encodeURIComponent(draftText.subject)}&body=${encodeURIComponent(draftText.body)}`
      : null;

  if (grouped.length === 0) return null;

  return (
    <>
      <Card className="border-l-4 border-l-red-500 bg-red-100/70 dark:bg-red-950/30">
        <CardHeader className="space-y-0 pb-0 pt-0">
          <CardTitle className="text-base leading-none">Action Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-3">
          {grouped.map((section) => {
            const summary = summarizeVendorFailureGroup(section.items);
            const n = summary.invoiceCount;
            return (
              <div key={section.key}>
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold tracking-tight">
                    {section.title}
                  </h3>
                  <div className="flex shrink-0 flex-wrap items-center justify-start gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="gap-1.5 bg-emerald-600 font-semibold text-white shadow-sm hover:bg-emerald-100 hover:text-black focus-visible:ring-emerald-500/90 dark:bg-emerald-600 dark:hover:bg-emerald-200 dark:hover:text-black"
                      onClick={() =>
                        openDraftForSection(section.key, section.items)
                      }
                    >
                      <Mail className="h-3.5 w-3.5" />
                      Draft Email
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => markFailureTypeAsRead(section.items)}
                    >
                      Mark as Read
                    </Button>
                  </div>
                </div>
                <p className="mb-2 text-sm leading-snug text-foreground">
                  {getVendorActionDetailLine(section.key, vendor)}
                </p>
                <div className="space-y-2 rounded-lg border border-border/70 bg-card px-3 py-2.5 shadow-sm">
                  <p className="text-sm font-medium text-foreground">
                    {n} {n === 1 ? "invoice" : "invoices"}
                    {summary.combinedUsd != null
                      ? ` · ${currencyFmt.format(summary.combinedUsd)} combined`
                      : ""}
                  </p>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground marker:text-muted-foreground">
                    {summary.materialLines.map((line) => (
                      <li
                        key={`${line.material}\u0000${line.qty}`}
                      >
                        {line.material} — Qty {line.qty}
                        {line.count > 1 ? ` (${line.count} invoices)` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Dialog open={draftOpen} onOpenChange={setDraftOpen}>
        <DialogContent
          className="max-h-[90vh] overflow-y-auto sm:max-w-lg md:max-w-3xl"
          showCloseButton
        >
          <DialogHeader>
            <DialogTitle>Draft email</DialogTitle>
            <DialogDescription>
              Review and send to{" "}
              {vendor.primary_contact_email?.trim() ?? "your vendor contact"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Subject</p>
            <p className="rounded-md border bg-muted/30 px-3 py-2 font-sans text-sm">
              {draftText.subject}
            </p>
            <p className="text-xs font-medium text-muted-foreground">Message</p>
            <Textarea
              readOnly
              value={draftText.body}
              onChange={(e) =>
                setDraftText((s) => ({ ...s, body: e.target.value }))
              }
              className="min-h-[280px] resize-y font-sans text-sm leading-relaxed"
            />
          </div>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => copyBody()}>
              {copied ? "Copied" : "Copy email"}
            </Button>
            {mailtoHref ? (
              <Button type="button" asChild>
                <a href={mailtoHref}>Open in email app</a>
              </Button>
            ) : (
              <Button type="button" variant="secondary" disabled>
                Add contact email to vendor record
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
