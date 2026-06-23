import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { apiGet, apiSend } from "@/lib/api";
import { useMut } from "@/lib/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";

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

  return (
    <>
      <Card>
        <CardHeader><CardTitle>เพิ่ม LINE OA (Messaging API channel)</CardTitle></CardHeader>
        <CardContent>
          <form className="grid grid-cols-1 sm:grid-cols-2 gap-2" onSubmit={submit}>
            <Input name="name" placeholder="ชื่อ OA (เช่น ร้านA)" required />
            <Input name="channel_id" placeholder="channel_id" required />
            <Input name="channel_secret" placeholder="channel_secret" type="password" required />
            <Input name="channel_access_token" placeholder="channel_access_token" type="password" required />
            <Button size="sm" type="submit" className="w-fit">เพิ่ม OA</Button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">secret/token เก็บฝั่ง server และไม่ถูกส่งกลับมาแสดงอีก (write-only)</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>OA ทั้งหมด</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <THead><TR><TH>ชื่อ</TH><TH>channel_id</TH><TH>token</TH><TH>สถานะ</TH><TH>Webhook URL (ใส่ใน LINE console)</TH><TH></TH></TR></THead>
            <TBody>
              {(list.data ?? []).map((o: any) => (
                <TR key={o.id}>
                  <TD>{o.name}</TD>
                  <TD className="font-mono text-xs">{o.channel_id}</TD>
                  <TD>{o.has_token ? <Badge variant="success">ตั้งแล้ว</Badge> : <Badge variant="warning">ยังไม่ตั้ง</Badge>}</TD>
                  <TD><Badge variant={o.is_active ? "success" : "secondary"}>{o.is_active ? "active" : "off"}</Badge></TD>
                  <TD className="font-mono text-xs flex items-center gap-1">
                    <span className="truncate max-w-[280px]">{webhookUrl(o.id)}</span>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copy(o.id)}><Copy className="h-3 w-3" /></Button>
                  </TD>
                  <TD>
                    <Button size="sm" variant={o.is_active ? "destructive" : "success"} onClick={() => toggle.mutate({ id: o.id, active: !o.is_active })}>
                      {o.is_active ? "ปิด" : "เปิด"}
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
