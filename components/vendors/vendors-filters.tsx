"use client";

import { useCallback } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface VendorFilters {
  search: string;
  statuses: string[];
  risk: string | null;
}

export function VendorsFiltersBar({
  filters,
  onFiltersChange,
  availableStatuses,
}: {
  filters: VendorFilters;
  onFiltersChange: (f: VendorFilters) => void;
  availableStatuses: string[];
}) {
  const updateFilter = useCallback(
    <K extends keyof VendorFilters>(key: K, value: VendorFilters[K]) => {
      onFiltersChange({ ...filters, [key]: value });
    },
    [filters, onFiltersChange],
  );

  const toggleStatus = useCallback(
    (status: string) => {
      const next = filters.statuses.includes(status)
        ? filters.statuses.filter((s) => s !== status)
        : [...filters.statuses, status];
      updateFilter("statuses", next);
    },
    [filters.statuses, updateFilter],
  );

  const hasActiveFilters =
    filters.search !== "" || filters.statuses.length > 0 || filters.risk !== null;

  const clearAll = useCallback(() => {
    onFiltersChange({
      search: "",
      statuses: [],
      risk: null,
    });
  }, [onFiltersChange]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-[220px] max-w-sm flex-1">
        <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search vendors..."
          value={filters.search}
          onChange={(e) => updateFilter("search", e.target.value)}
          className="pl-9"
        />
      </div>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <SlidersHorizontal className="size-4" />
            Status
            {filters.statuses.length > 0 && (
              <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs">
                {filters.statuses.length}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2" align="start">
          <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
            {availableStatuses.map((status) => (
              <label
                key={status}
                className="hover:bg-accent flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm"
              >
                <Checkbox
                  checked={filters.statuses.includes(status)}
                  onCheckedChange={() => toggleStatus(status)}
                />
                {status}
              </label>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <div className="min-w-0 max-w-full overflow-x-auto sm:max-w-none sm:overflow-visible">
        <Tabs
          value={filters.risk ?? "all"}
          onValueChange={(v) =>
            updateFilter("risk", v === "all" ? null : v)
          }
        >
          <TabsList>
            <TabsTrigger value="all">All Risks</TabsTrigger>
            <TabsTrigger value="low">Low</TabsTrigger>
            <TabsTrigger value="medium">Medium</TabsTrigger>
            <TabsTrigger value="high">High</TabsTrigger>
            <TabsTrigger value="critical">Critical</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 text-muted-foreground"
          onClick={clearAll}
        >
          <X className="size-3.5" />
          Clear
        </Button>
      )}
    </div>
  );
}
