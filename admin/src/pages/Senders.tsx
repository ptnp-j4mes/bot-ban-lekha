import { useQuery } from "@tanstack/react-query";
import { apiGet, apiSend } from "@/lib/api";
import { useMut } from "@/lib/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";

// Track who sends slips in groups: map LINE userId -> a name you choose.
export function Senders() {
  const list = useQuery({ queryKey: ["senders"], queryFn: () => apiGet("/api/senders") });
  const rename = useMut((b: { id: string; name: string }) => apiSend(`/api/senders/${b.id}`, "PATCH", { name: b.name }), { success: "เปลี่ยนชื่อแล้ว", invalidate: ["senders", "subs"] });

  return (
    <Card>
      <CardHeader><CardTitle>ผู้ส่งสลิป (กลุ่ม)</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <THead><TR><TH>ชื่อ</TH><TH>LINE userId</TH><TH>จำนวนสลิป</TH><TH></TH></TR></THead>
          <TBody>
            {(list.data ?? []).map((u: any) => (
              <TR key={u.id}>
                <TD>{u.name}</TD>
                <TD className="font-mono text-xs">{u.line_user_id}</TD>
                <TD>{u.slip_count}</TD>
                <TD><Button size="sm" variant="outline" onClick={() => { const n = prompt("ตั้งชื่อผู้ส่ง:", u.name); if (n && n.trim()) rename.mutate({ id: u.id, name: n.trim() }); }}>เปลี่ยนชื่อ</Button></TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {!list.data?.length && <p className="text-sm text-muted-foreground">ยังไม่มีผู้ส่งสลิปในกลุ่ม</p>}
      </CardContent>
    </Card>
  );
}
