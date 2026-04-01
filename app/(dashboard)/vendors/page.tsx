"use client";

import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import type { Vendor } from "@/lib/types";
import { listVendors } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  VendorsFiltersBar,
  type VendorFilters,
} from "@/components/vendors/vendors-filters";
import { VendorsTable } from "@/components/vendors/vendors-table";

const defaultFilters: VendorFilters = {
  search: "",
  statuses: [],
  risk: null,
};

function applyFilters(items: Vendor[], filters: VendorFilters): Vendor[] {
  let result = items;

  if (filters.search) {
    const q = filters.search.toLowerCase();
    result = result.filter((v) => {
      return (
        v.company_name.toLowerCase().includes(q) ||
        v.vendor_id.toLowerCase().includes(q) ||
        (v.country ?? "").toLowerCase().includes(q) ||
        (v.primary_contact_name ?? "").toLowerCase().includes(q)
      );
    });
  }

  if (filters.statuses.length > 0) {
    result = result.filter((v) =>
      filters.statuses.includes(v.qualification_status ?? ""),
    );
  }

  if (filters.risk) {
    result = result.filter(
      (v) => (v.vendor_risk_rating ?? "").toLowerCase() === filters.risk,
    );
  }

  return result;
}

function exportToCSV(items: Vendor[]) {
  const headers = [
    "Vendor ID",
    "Company",
    "Status",
    "Risk",
    "Country",
    "Payment Terms",
    "Incoterms",
    "Annual Spend USD",
    "Primary Contact",
    "Primary Contact Email",
  ];
  const rows = items.map((v) => [
    v.vendor_id,
    v.company_name,
    v.qualification_status ?? "",
    v.vendor_risk_rating ?? "",
    v.country ?? "",
    v.payment_terms_days != null ? `Net ${v.payment_terms_days}` : "",
    v.incoterms ?? "",
    v.annual_spend_usd ?? "",
    v.primary_contact_name ?? "",
    v.primary_contact_email ?? "",
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map((value) => `"${String(value)}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "vendors-worklist.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function VendorsPage() {
  const [allVendors, setAllVendors] = useState<Vendor[]>([]);
  const [filters, setFilters] = useState<VendorFilters>(defaultFilters);

  useEffect(() => {
    listVendors().then(setAllVendors).catch(console.error);
  }, []);

  const filteredVendors = useMemo(
    () => applyFilters(allVendors, filters),
    [allVendors, filters],
  );

  const availableStatuses = useMemo(
    () =>
      [...new Set(allVendors.map((v) => v.qualification_status).filter(Boolean))]
        .map((s) => String(s))
        .sort(),
    [allVendors],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Vendors</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {filteredVendors.length} vendor
            {filteredVendors.length === 1 ? "" : "s"}
            {filters.search || filters.statuses.length > 0 || filters.risk
              ? " matching filters"
              : " total"}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => exportToCSV(filteredVendors)}
        >
          <Download className="size-4" />
          Download CSV
        </Button>
      </div>

      <VendorsFiltersBar
        filters={filters}
        onFiltersChange={setFilters}
        availableStatuses={availableStatuses}
      />

      <VendorsTable items={filteredVendors} />
    </div>
  );
}
