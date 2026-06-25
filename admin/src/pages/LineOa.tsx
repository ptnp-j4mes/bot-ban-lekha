import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { apiGet, apiSend } from "@/lib/api";
import { useMut } from "@/lib/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";
const webhookUrl = (id: string) => `${API_BASE || "<BACKEND_URL>"}/api/line/webhook/${id}`;

export function LineOa() {
  const list = useQuery({ queryKey: ["line-oa"], queryFn: () => apiGet("/api/line-oa-accounts") });
  const create = useMut((b: any) => apiSend("/api/line-oa-accounts", "POST", b), { success: "เพิ่ม OA แล้ว", invalidate: ["line-oa"] });
  const toggle = useMut((b: { id: string; active: boolean }) => apiSend(`/api/line-oa-accounts/${b.id}`, "PATCH", { is_active: b.active }), {
    success: "อัปเดตแล้ว",
    invalidate: ["line-oa"],
  });

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget).entries());
    create.mutate(f);
    e.currentTarget.reset();
  };
  const copy = (id: string) => { navigator.clipboard?.writeText(webhookUrl(id)); toast.success("คัดลอก Webhook URL แล้ว"); };

  const columns: Column<any>[] = [
    { key: "name", header: "ชื่อ", sortValue: (o) => o.name, cell: (o) => o.name },
    { key: "cid", header: "channel_id", cell: (o) => <span className="fig text-xs">{o.channel_id}</span> },
    { key: "token", header: "token", cell: (o) => o.has_token ? <Badge variant="success">ตั้งแล้ว</Badge> : <Badge variant="warning">ยังไม่ตั้ง</Badge> },
    { key: "status", header: "สถานะ", sortValue: (o) => (o.is_active ? 1 : 0), cell: (o) => <Badge variant={o.is_active ? "success" : "secondary"}>{o.is_active ? "active" : "off"}</Badge> },
    { key: "hook", header: "Webhook URL", stop: true, cell: (o) => (
      <span className="flex items-center gap-1 font-mono text-xs">
        <span className="max-w-[280px] truncate">{webhookUrl(o.id)}</span>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copy(o.id)}><Copy className="h-3 w-3" /></Button>
      </span>
    ) },
    { key: "act", header: "", stop: true, cell: (o) => (
      <Button size="sm" variant={o.is_active ? "destructive" : "success"} onClick={() => toggle.mutate({ id: o.id, active: !o.is_active })}>{o.is_active ? "ปิด" : "เปิด"}</Button>
    ) },
  ];

  return (
    <>
      <Card>
        <CardHeader><CardTitle>เพิ่ม LINE OA (Messaging API channel)</CardTitle></CardHeader>
        <CardContent>
          <form className="grid grid-cols-1 gap-3 sm:grid-cols-2" onSubmit={submit}>
            <Field label="ชื่อ OA"><Input name="name" placeholder="เช่น ร้าน A" required /></Field>
            <Field label="Channel ID"><Input name="channel_id" required /></Field>
            <Field label="Channel Secret"><Input name="channel_secret" type="password" required /></Field>
            <Field label="Channel Access Token"><Input name="channel_access_token" type="password" required /></Field>
            <Button type="submit" className="w-fit">เพิ่ม OA</Button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">secret/token เก็บฝั่ง server และไม่ถูกส่งกลับมาแสดงอีก (write-only)</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>OA ทั้งหมด</CardTitle></CardHeader>
        <CardContent className="p-0">
          <DataTable data={list.data ?? []} columns={columns} rowKey={(o) => o.id} initialSort={{ key: "name", dir: "asc" }} empty="ยังไม่มี LINE OA" />
        </CardContent>
      </Card>
    </>
  );
}
