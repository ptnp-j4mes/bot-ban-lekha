import { useQuery } from "@tanstack/react-query";
import { apiGet, apiSend } from "@/lib/api";
import { useMut } from "@/lib/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";

// Manage LINE groups the bot collects slips from: rename for readable reports.
export function Groups() {
  const list = useQuery({ queryKey: ["groups-line"], queryFn: () => apiGet("/api/groups") });
  const rename = useMut((b: { id: string; name: string }) => apiSend(`/api/groups/${b.id}`, "PATCH", { name: b.name }), { success: "เปลี่ยนชื่อแล้ว", invalidate: ["groups-line", "report-daily"] });

  return (
    <Card>
      <CardHeader><CardTitle>กลุ่ม LINE (ที่บอทเก็บสลิป)</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <THead><TR><TH>ชื่อกลุ่ม</TH><TH>group id</TH><TH>จำนวนสลิป</TH><TH></TH></TR></THead>
          <TBody>
            {(list.data ?? []).map((g: any) => (
              <TR key={g.id}>
                <TD>{g.name}</TD>
                <TD className="font-mono text-xs">{g.line_group_id}</TD>
                <TD>{g.slip_count}</TD>
                <TD><Button size="sm" variant="outline" onClick={() => { const n = prompt("ตั้งชื่อกลุ่ม:", g.name); if (n && n.trim()) rename.mutate({ id: g.id, name: n.trim() }); }}>เปลี่ยนชื่อ</Button></TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {!list.data?.length && <p className="text-sm text-muted-foreground">ยังไม่มีกลุ่มที่บอทเก็บสลิป</p>}
      </CardContent>
    </Card>
  );
}
