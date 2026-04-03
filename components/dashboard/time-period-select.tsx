"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSharedTimePeriod } from "@/contexts/time-period-context";
import type { TimePeriod } from "@/lib/dashboard-time-period";
import { cn } from "@/lib/utils";

export function TimePeriodSelect({ className }: { className?: string }) {
  const { timePeriod, setTimePeriod } = useSharedTimePeriod();

  return (
    <div className={cn("w-full sm:w-auto", className)}>
      <Select
        value={timePeriod}
        onValueChange={(v) => setTimePeriod(v as TimePeriod)}
      >
        <SelectTrigger className="w-full sm:w-[180px]">
          <SelectValue placeholder="Select period" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="last_90_days">Last 90 days</SelectItem>
          <SelectItem value="year_to_date">Year To Date</SelectItem>
          <SelectItem value="last_year">Last Year</SelectItem>
          <SelectItem value="all_time">All Time</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
