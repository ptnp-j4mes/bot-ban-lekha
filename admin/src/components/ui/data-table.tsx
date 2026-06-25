import { useMemo, useState } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";

export type Column<T> = {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number | Date | null | undefined; // omit = not sortable
  align?: "right" | "center";
  className?: string;
  /** Stop row-click (detail dialog) when clicking inside this cell — for action buttons. */
  stop?: boolean;
};

type Detail<T> = { title?: React.ReactNode; body: React.ReactNode } | React.ReactNode;

const alignCls = (a?: "right" | "center") => (a === "right" ? "text-right" : a === "center" ? "text-center" : "");

function compare(a: any, b: any) {
  if (a == null && b == null) return 0;
  if (a == null) return 1; // nulls last
  if (b == null) return -1;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "th");
}

export function DataTable<T>({
  data,
  columns,
  rowKey,
  initialSort,
  detail,
  detailTitle,
  empty = "ไม่มีข้อมูล",
  maxHeight = "65vh",
}: {
  data: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  initialSort?: { key: string; dir: "asc" | "desc" };
  detail?: (row: T) => Detail<T>;        // provided → rows open a detail dialog
  detailTitle?: React.ReactNode;
  empty?: React.ReactNode;
  maxHeight?: string;
}) {
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(initialSort ?? null);
  const [openRow, setOpenRow] = useState<T | null>(null);

  const sorted = useMemo(() => {
    if (!sort) return data;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return data;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...data].sort((a, b) => compare(col.sortValue!(a), col.sortValue!(b)) * dir);
  }, [data, sort, columns]);

  const toggle = (key: string) =>
    setSort((s) => (s?.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : null));

  const detailContent = openRow != null ? detail?.(openRow) : null;
  const isStruct = (x: any): x is { title?: React.ReactNode; body: React.ReactNode } =>
    x != null && typeof x === "object" && "body" in x;

  return (
    <>
      {sorted.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">{empty}</p>
      ) : (
        <Table maxHeight={maxHeight}>
          <THead>
            <TR className="border-0 hover:bg-transparent">
              {columns.map((c) => {
                const active = sort?.key === c.key;
                const Icon = !active ? ChevronsUpDown : sort!.dir === "asc" ? ChevronUp : ChevronDown;
                return (
                  <TH key={c.key} className={cn(alignCls(c.align), c.className)}>
                    {c.sortValue ? (
                      <button
                        onClick={() => toggle(c.key)}
                        className={cn(
                          "inline-flex items-center gap-1 hover:text-foreground",
                          c.align === "right" && "flex-row-reverse",
                          active && "text-foreground"
                        )}
                      >
                        {c.header}
                        <Icon className="h-3 w-3 opacity-60" />
                      </button>
                    ) : (
                      c.header
                    )}
                  </TH>
                );
              })}
            </TR>
          </THead>
          <TBody>
            {sorted.map((row) => (
              <TR
                key={rowKey(row)}
                className={detail ? "cursor-pointer" : undefined}
                onClick={detail ? () => setOpenRow(row) : undefined}
              >
                {columns.map((c) => (
                  <TD
                    key={c.key}
                    className={cn(alignCls(c.align), c.className)}
                    onClick={c.stop ? (e) => e.stopPropagation() : undefined}
                  >
                    {c.cell(row)}
                  </TD>
                ))}
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {detail && (
        <Dialog open={openRow != null} onClose={() => setOpenRow(null)} title={(isStruct(detailContent) && detailContent.title) || detailTitle || "รายละเอียด"}>
          {isStruct(detailContent) ? detailContent.body : detailContent}
        </Dialog>
      )}
    </>
  );
}
