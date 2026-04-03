"use client";

import { TimePeriodSelect } from "@/components/dashboard/time-period-select";
import { InvoicesTablesSection } from "@/components/invoices/invoices-tables-section";

export default function InvoicesPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Invoices</h1>
        </div>
        <TimePeriodSelect />
      </div>

      <InvoicesTablesSection />
    </div>
  );
}
