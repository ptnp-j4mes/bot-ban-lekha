import { useQuery } from "@tanstack/react-query";
import { apiGet, apiSend } from "@/lib/api";
import { useMut } from "@/lib/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { usePrompt } from "@/components/ui/confirm";

// Track who sends slips in groups: map LINE userId -> a name you choose.
export function Senders() {
  const prompt = usePrompt();
  const list = useQuery({ queryKey: ["senders"], queryFn: () => apiGet("/api/senders") });
  const rename = useMut((b: { id: string; name: string }) => apiSend(`/api/senders/${b.id}`, "PATCH", { name: b.name }), { success: "เปลี่ยนชื่อแล้ว", invalidate: ["senders", "subs"] });
  const renameSender = async (sender: any) => {
    const name = await prompt({ title: "ตั้งชื่อผู้ส่ง", defaultValue: sender.name, placeholder: "ชื่อผู้ส่ง", confirmLabel: "บันทึก" });
    if (name?.trim()) rename.mutate({ id: sender.id, name: name.trim() });
  };

  const columns: Column<any>[] = [
    { key: "name", header: "ชื่อ", sortValue: (u) => u.name, cell: (u) => u.name },
    { key: "uid", header: "LINE userId", cell: (u) => <span className="fig text-xs">{u.line_user_id}</span> },
    { key: "slips", header: "จำนวนสลิป", align: "right", sortValue: (u) => u.slip_count, cell: (u) => u.slip_count },
    { key: "act", header: "", stop: true, cell: (u) => <Button size="sm" variant="outline" onClick={() => void renameSender(u)}>เปลี่ยนชื่อ</Button> },
  ];

  return (
    <Card>
      <CardHeader><CardTitle>ผู้ส่งสลิป (กลุ่ม)</CardTitle></CardHeader>
      <CardContent className="p-0">
        <DataTable data={list.data ?? []} columns={columns} rowKey={(u) => u.id} initialSort={{ key: "slips", dir: "desc" }} empty="ยังไม่มีผู้ส่งสลิปในกลุ่ม" />
      </CardContent>
    </Card>
  );
}
