import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Upload } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiSend } from "@/lib/api";
import { useMut } from "@/lib/ui";
import { CustomerDetail } from "./CustomerDetail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";

const LIMIT = 20;
const formObj = (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  return Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>;
};

export function Customers() {
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const list = useQuery({ queryKey: ["customers", q, page], queryFn: () => apiGet(`/api/customers?limit=${LIMIT}&page=${page}&search=${encodeURIComponent(q)}`) });
  const oas = useQuery({ queryKey: ["line-oa"], queryFn: () => apiGet("/api/line-oa-accounts") });
  const create = useMut((b: any) => apiSend("/api/customers", "POST", b), { success: "เพิ่มลูกค้าแล้ว", invalidate: ["customers"] });
  const link = useMut((b: any) => apiSend("/api/customers/link-line", "POST", b), { success: "ผูก LINE แล้ว", invalidate: ["customers"] });
  const update = useMut((b: { id: string; data: any }) => apiSend(`/api/customers/${b.id}`, "PATCH", b.data), { success: "บันทึกแล้ว", invalidate: ["customers"] });
  const bulk = useMut((rows: any[]) => apiSend("/api/customers/bulk", "POST", { rows }), { success: "นำเข้าแล้ว", invalidate: ["customers"] });

  const importCsv = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const lines = String(reader.result).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      // optional header row: customer_code,display_name,phone
      const start = /code/i.test(lines[0] ?? "") ? 1 : 0;
      const rows = lines.slice(start).map((l) => {
        const [customer_code, display_name, phone] = l.split(",").map((x) => x?.trim());
        return { customer_code, display_name: display_name || undefined, phone: phone || undefined };
      }).filter((r) => r.customer_code);
      if (!rows.length) return toast.error("ไม่พบข้อมูลใน CSV");
      bulk.mutate(rows);
    };
    reader.readAsText(file);
  };

  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <>
      <Card>
        <CardHeader><CardTitle>เพิ่มลูกค้า</CardTitle></CardHeader>
        <CardContent>
          <form className="flex flex-wrap gap-2" onSubmit={(e) => { create.mutate(formObj(e)); e.currentTarget.reset(); }}>
            <Input name="customer_code" placeholder="customer_code" className="w-44" required />
            <Input name="display_name" placeholder="ชื่อ" className="w-44" />
            <Input name="phone" placeholder="เบอร์" className="w-36" />
            <Select name="line_oa_id" className="w-48" defaultValue="">
              <option value="">— เลือก LINE OA —</option>
              {(oas.data ?? []).filter((o: any) => o.is_active).map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </Select>
            <Button size="sm" type="submit">เพิ่ม</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>ผูก LINE user id</CardTitle></CardHeader>
        <CardContent>
          <form className="flex flex-wrap gap-2" onSubmit={(e) => link.mutate(formObj(e))}>
            <Input name="customer_code" placeholder="customer_code" className="w-44" required />
            <Input name="line_user_id" placeholder="line_user_id (Uxxxx)" className="w-56" required />
            <Button size="sm" type="submit">ผูก</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <CardTitle>ลูกค้าทั้งหมด ({total})</CardTitle>
          <div className="ml-auto flex items-center gap-2">
            <label className="cursor-pointer">
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])} />
              <span className="inline-flex h-9 items-center gap-1 rounded-lg bg-background neu-raised-sm px-3.5 text-xs"><Upload className="h-3 w-3" /> นำเข้า CSV</span>
            </label>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setPage(1); setQ(search); }}>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหา code/ชื่อ/เบอร์" className="w-56" />
              <Button size="sm" type="submit">ค้นหา</Button>
            </form>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <THead><TR><TH>code</TH><TH>ชื่อ</TH><TH>เบอร์</TH><TH>LINE</TH><TH>สถานะ</TH><TH></TH></TR></THead>
            <TBody>
              {(list.data?.items ?? []).map((c: any) => editing === c.id ? (
                <TR key={c.id}>
                  <TD>{c.customer_code}</TD>
                  <TD><Input defaultValue={c.display_name ?? ""} className="h-8 w-32" id={`dn-${c.id}`} /></TD>
                  <TD><Input defaultValue={c.phone ?? ""} className="h-8 w-28" id={`ph-${c.id}`} /></TD>
                  <TD>{c.line_user_id ? <Check className="h-4 w-4 text-green-600" /> : "—"}</TD>
                  <TD>
                    <Select defaultValue={c.status} className="h-8 w-24" id={`st-${c.id}`}>
                      {["active", "blocked", "closed"].map((s) => <option key={s}>{s}</option>)}
                    </Select>
                  </TD>
                  <TD className="flex gap-1">
                    <Button size="sm" onClick={() => {
                      const dn = (document.getElementById(`dn-${c.id}`) as HTMLInputElement).value;
                      const ph = (document.getElementById(`ph-${c.id}`) as HTMLInputElement).value;
                      const st = (document.getElementById(`st-${c.id}`) as HTMLSelectElement).value;
                      update.mutate({ id: c.id, data: { display_name: dn, phone: ph, status: st } });
                      setEditing(null);
                    }}>บันทึก</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>ยกเลิก</Button>
                  </TD>
                </TR>
              ) : (
                <TR key={c.id}>
                  <TD>{c.customer_code}</TD>
                  <TD>{c.display_name}</TD>
                  <TD>{c.phone}</TD>
                  <TD>{c.line_user_id ? <Check className="h-4 w-4 text-green-600" /> : <span className="text-muted-foreground">—</span>}</TD>
                  <TD><Badge variant="secondary">{c.status}</Badge></TD>
                  <TD className="flex gap-1">
                    <Button size="sm" onClick={() => setDetailId(c.id)}>ดู</Button>
                    <Button size="sm" variant="outline" onClick={() => setEditing(c.id)}>แก้ไข</Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {pages > 1 && (
            <div className="flex items-center justify-end gap-2 mt-3 text-sm">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>ก่อนหน้า</Button>
              <span>{page} / {pages}</span>
              <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>ถัดไป</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {detailId && <CustomerDetail id={detailId} onClose={() => setDetailId(null)} />}
    </>
  );
}
