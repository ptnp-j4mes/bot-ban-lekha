import { useQuery } from "@tanstack/react-query";
import { apiGet, apiSend } from "@/lib/api";
import { useMut } from "@/lib/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";

// Manage LINE groups the bot collects slips from: rename for readable reports.
export function Groups() {
  const list = useQuery({ queryKey: ["groups-line"], queryFn: () => apiGet("/api/groups") });
  const rename = useMut((b: { id: string; name: string }) => apiSend(`/api/groups/${b.id}`, "PATCH", { name: b.name }), { success: "เปลี่ยนชื่อแล้ว", invalidate: ["groups-line", "report-daily"] });

  const columns: Column<any>[] = [
    { key: "name", header: "ชื่อกลุ่ม", sortValue: (g) => g.name, cell: (g) => g.name },
    { key: "gid", header: "group id", cell: (g) => <span className="fig text-xs">{g.line_group_id}</span> },
    { key: "slips", header: "จำนวนสลิป", align: "right", sortValue: (g) => g.slip_count, cell: (g) => g.slip_count },
    { key: "act", header: "", stop: true, cell: (g) => <Button size="sm" variant="outline" onClick={() => { const n = prompt("ตั้งชื่อกลุ่ม:", g.name); if (n && n.trim()) rename.mutate({ id: g.id, name: n.trim() }); }}>เปลี่ยนชื่อ</Button> },
  ];

  return (
    <Card>
      <CardHeader><CardTitle>กลุ่ม LINE (ที่บอทเก็บสลิป)</CardTitle></CardHeader>
      <CardContent className="p-0">
        <DataTable data={list.data ?? []} columns={columns} rowKey={(g) => g.id} initialSort={{ key: "slips", dir: "desc" }} empty="ยังไม่มีกลุ่มที่บอทเก็บสลิป" />
      </CardContent>
    </Card>
  );
}
