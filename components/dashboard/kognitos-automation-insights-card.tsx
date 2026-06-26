"use client";

import { useEffect, useMemo, useState } from "react";
import { Zap } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  filterRunRowsWithResolvableVendor,
  getKognitosInsightsCacheFromDb,
  listKognitosRunRowsFromDb,
  listVendors,
  type KognitosRunRow,
} from "@/lib/api";
import type { KognitosInsights, Vendor } from "@/lib/types";
import {
  aggregateResults,
  buildRunSummaryFromRun,
  extractFourWayMatchFromRun,
} from "@/lib/p2p-insights";
import { fourWayForRow, summaryForRow } from "@/lib/kognitos/run-row-cache";
import {
  averageRunDurationMs,
  formatDurationMs,
} from "@/lib/kognitos/dashboard-metrics";
import { getRunStateLabel, isCompletedRun } from "@/lib/kognitos/run-dashboard";
import { inSelectedPeriod } from "@/lib/dashboard-time-period";
import { useSharedTimePeriod } from "@/contexts/time-period-context";

export function KognitosAutomationInsightsCard() {
  const { timePeriod } = useSharedTimePeriod();
  const [insights, setInsights] = useState<KognitosInsights | null>(null);
  const [runRows, setRunRows] = useState<KognitosRunRow[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);

  function loadData() {
    Promise.all([
      getKognitosInsightsCacheFromDb(),
      listKognitosRunRowsFromDb().catch((err) => {
        console.error("listKognitosRunRowsFromDb:", err);
        return [] as KognitosRunRow[];
      }),
      listVendors().catch(() => [] as Vendor[]),
    ]).then(([cache, rows, vendorList]) => {
      setInsights(cache.insights);
      setRunRows(rows);
      setVendors(vendorList);
    });
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const handler = () => loadData();
    window.addEventListener("chat-data-changed", handler);
    return () => window.removeEventListener("chat-data-changed", handler);
  }, []);

  const filteredRunRows = useMemo(
    () =>
      runRows.filter((row) =>
        inSelectedPeriod(row.run.createTime, timePeriod),
      ),
    [runRows, timePeriod],
  );

  const vendorResolvableRunRows = useMemo(
    () => filterRunRowsWithResolvableVendor(vendors, filteredRunRows),
    [vendors, filteredRunRows],
  );

  const p2pForWidgets = useMemo(() => {
    const parsed = vendorResolvableRunRows
      .map((row) => fourWayForRow(row))
      .filter((x): x is NonNullable<typeof x> => x != null);
    const summaries = vendorResolvableRunRows.map((row) => summaryForRow(row));
    return aggregateResults(parsed, summaries);
  }, [vendorResolvableRunRows]);

  const { completedRunRows } = useMemo(() => {
    const completed = vendorResolvableRunRows.filter((row) =>
      isCompletedRun(row.run, p2pForWidgets),
    );
    return { completedRunRows: completed };
  }, [vendorResolvableRunRows, p2pForWidgets]);

  const totalRunsDisplay = useMemo(
    () => vendorResolvableRunRows.length,
    [vendorResolvableRunRows.length],
  );

  const stpDisplay = useMemo(() => {
    if (vendorResolvableRunRows.length === 0) return 0;
    return Math.round(
      (completedRunRows.length / vendorResolvableRunRows.length) * 100,
    );
  }, [vendorResolvableRunRows.length, completedRunRows.length]);

  const awaitingGuidanceDisplay = useMemo(() => {
    return vendorResolvableRunRows.filter(
      (r) => getRunStateLabel(r.run.state) === "awaitingGuidance",
    ).length;
  }, [vendorResolvableRunRows]);

  const avgRunDurationMs = useMemo(
    () => averageRunDurationMs(completedRunRows.map((r) => r.run)),
    [completedRunRows],
  );

  if (insights == null && vendorResolvableRunRows.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          Kognitos Automation Insights
        </CardTitle>
        {vendorResolvableRunRows.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Values in this card reflect the selected time window.
          </p>
        )}
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Total Runs
            </p>
            <p className="text-lg font-bold">{totalRunsDisplay}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Completion rate
            </p>
            <p className="text-lg font-bold">{stpDisplay}%</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Average Run Time
            </p>
            <p className="text-lg font-bold">
              {formatDurationMs(avgRunDurationMs)}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Awaiting Guidance
            </p>
            <p className="text-lg font-bold">{awaitingGuidanceDisplay}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
