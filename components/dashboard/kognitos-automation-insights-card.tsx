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
  getKognitosInsightsCacheFromDb,
  listKognitosRunRowsFromDb,
  type KognitosRunRow,
} from "@/lib/api";
import type { KognitosInsights } from "@/lib/types";
import {
  aggregateResults,
  buildRunSummaryFromRun,
  extractFourWayMatchFromRun,
} from "@/lib/p2p-insights";
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

  function loadData() {
    Promise.all([
      getKognitosInsightsCacheFromDb(),
      listKognitosRunRowsFromDb().catch((err) => {
        console.error("listKognitosRunRowsFromDb:", err);
        return [] as KognitosRunRow[];
      }),
    ]).then(([cache, rows]) => {
      setInsights(cache.insights);
      setRunRows(rows);
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

  const p2pForWidgets = useMemo(() => {
    const parsed = filteredRunRows
      .map((row) => extractFourWayMatchFromRun(row.run))
      .filter((x): x is NonNullable<typeof x> => x != null);
    const summaries = filteredRunRows.map((row) =>
      buildRunSummaryFromRun(row.run),
    );
    return aggregateResults(parsed, summaries);
  }, [filteredRunRows]);

  const { completedRunRows } = useMemo(() => {
    const completed = filteredRunRows.filter((row) =>
      isCompletedRun(row.run, p2pForWidgets),
    );
    return { completedRunRows: completed };
  }, [filteredRunRows, p2pForWidgets]);

  const totalRunsDisplay = useMemo(
    () => filteredRunRows.length,
    [filteredRunRows.length],
  );

  const stpDisplay = useMemo(() => {
    if (filteredRunRows.length === 0) return 0;
    return Math.round(
      (completedRunRows.length / filteredRunRows.length) * 100,
    );
  }, [filteredRunRows.length, completedRunRows.length]);

  const awaitingGuidanceDisplay = useMemo(() => {
    return filteredRunRows.filter(
      (r) => getRunStateLabel(r.run.state) === "awaitingGuidance",
    ).length;
  }, [filteredRunRows]);

  const avgRunDurationMs = useMemo(
    () => averageRunDurationMs(completedRunRows.map((r) => r.run)),
    [completedRunRows],
  );

  if (insights == null && filteredRunRows.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          Kognitos Automation Insights
        </CardTitle>
        {filteredRunRows.length > 0 && (
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
