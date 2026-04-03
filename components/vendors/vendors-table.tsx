"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArrowUpDown,
  ChevronDown,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Columns3,
} from "lucide-react";
import type { Vendor } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function buildColumns(): ColumnDef<Vendor>[] {
  return [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(v) => row.toggleSelected(!!v)}
          onClick={(e) => e.stopPropagation()}
          aria-label="Select row"
        />
      ),
      size: 40,
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "company_name",
      header: "Vendor",
      cell: ({ row }) => (
        <div className="space-y-0.5">
          <p className="font-medium">{row.original.company_name}</p>
          <p className="font-mono text-xs text-muted-foreground">
            {row.original.vendor_id}
          </p>
        </div>
      ),
    },
    {
      accessorKey: "qualification_status",
      header: "Status",
    },
    {
      accessorKey: "vendor_risk_rating",
      header: "Risk",
      cell: ({ row }) => (
        <span className="capitalize">{row.original.vendor_risk_rating ?? "—"}</span>
      ),
    },
    {
      accessorKey: "country",
      header: "Country",
    },
    {
      accessorKey: "payment_terms_days",
      header: "Payment Terms",
      cell: ({ row }) =>
        row.original.payment_terms_days != null
          ? `Net ${row.original.payment_terms_days}`
          : "—",
    },
    {
      accessorKey: "incoterms",
      header: "Incoterms",
      cell: ({ row }) => row.original.incoterms ?? "—",
    },
    {
      accessorKey: "annual_spend_usd",
      header: "Annual Spend",
      cell: ({ row }) =>
        row.original.annual_spend_usd != null
          ? formatCurrency(row.original.annual_spend_usd)
          : "—",
    },
    {
      accessorKey: "primary_contact_name",
      header: "Primary Contact",
      cell: ({ row }) => row.original.primary_contact_name ?? "—",
    },
  ];
}

function SortIcon({ isSorted }: { isSorted: false | "asc" | "desc" }) {
  if (isSorted === "asc") return <ChevronUp className="size-3.5" />;
  if (isSorted === "desc") return <ChevronDown className="size-3.5" />;
  return <ArrowUpDown className="size-3.5 opacity-40" />;
}

export function VendorsTable({ items }: { items: Vendor[] }) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const columns = useMemo(() => buildColumns(), []);

  const table = useReactTable({
    data: items,
    columns,
    state: { sorting, rowSelection },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row) => row.vendor_id,
    initialState: { pagination: { pageSize: 10 } },
  });

  const selectedCount = Object.keys(rowSelection).length;
  const paginationRange = useMemo(() => {
    const { pageIndex, pageSize } = table.getState().pagination;
    const total = table.getFilteredRowModel().rows.length;
    const start = total === 0 ? 0 : pageIndex * pageSize + 1;
    const end = Math.min((pageIndex + 1) * pageSize, total);
    return { start, end, total };
  }, [table.getFilteredRowModel().rows.length, table.getState().pagination]);

  return (
    <div className="space-y-2">
      {selectedCount > 0 && (
        <div className="rounded-lg border bg-accent/50 px-4 py-2">
          <span className="text-sm font-medium">
            {selectedCount} vendor{selectedCount === 1 ? "" : "s"} selected
          </span>
        </div>
      )}

      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button
                        className="inline-flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:text-foreground"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                        <SortIcon isSorted={header.column.getIsSorted()} />
                      </button>
                    ) : (
                      flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className="cursor-pointer"
                  onClick={() => router.push(`/vendors/${row.original.vendor_id}`)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  No vendors match your filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between px-1">
        <p className="text-sm text-muted-foreground">
          {paginationRange.start}–{paginationRange.end} of {paginationRange.total}{" "}
          vendors
        </p>

        <div className="flex items-center gap-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Columns3 className="size-4" />
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {table
                .getAllColumns()
                .filter((column) => column.getCanHide())
                .map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) => column.toggleVisibility(!!value)}
                  >
                    {String(column.columnDef.header)}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Rows</span>
            <Select
              value={String(table.getState().pagination.pageSize)}
              onValueChange={(v) => table.setPageSize(Number(v))}
            >
              <SelectTrigger size="sm" className="w-[70px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 25, 50].map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8"
              aria-label="First page"
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.setPageIndex(0)}
            >
              <ChevronFirst className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8"
              aria-label="Previous page"
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.previousPage()}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8"
              aria-label="Next page"
              disabled={!table.getCanNextPage()}
              onClick={() => table.nextPage()}
            >
              <ChevronRight className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8"
              aria-label="Last page"
              disabled={!table.getCanNextPage()}
              onClick={() =>
                table.setPageIndex(Math.max(0, table.getPageCount() - 1))
              }
            >
              <ChevronLast className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
