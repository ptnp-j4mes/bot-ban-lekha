import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Upload } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiSend } from "@/lib/api";
import { useMut, statusTh } from "@/lib/ui";
import { CustomerDetail } from "./CustomerDetail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";

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

  const saveRow = (id: string) => {
    const dn = (document.getElementById(`dn-${id}`) as HTMLInputElement).value;
    const ph = (document.getElementById(`ph-${id}`) as HTMLInputElement).value;
    const st = (document.getElementById(`st-${id}`) as HTMLSelectElement).value;
    update.mutate({ id, data: { display_name: dn, phone: ph, status: st } });
    setEditing(null);
  };

  const columns: Column<any>[] = [
    { key: "code", header: "รหัส", sortValue: (c) => c.customer_code, cell: (c) => <span className="fig">{c.customer_code}</span> },
    { key: "name", header: "ชื่อ", sortValue: (c) => c.display_name ?? "", cell: (c) => editing === c.id
      ? <Input defaultValue={c.display_name ?? ""} className="h-8 w-32" id={`dn-${c.id}`} />
      : c.display_name },
    { key: "phone", header: "เบอร์", cell: (c) => editing === c.id
      ? <Input defaultValue={c.phone ?? ""} className="h-8 w-28" id={`ph-${c.id}`} />
      : <span className="fig">{c.phone}</span> },
    { key: "line", header: "LINE", sortValue: (c) => (c.line_user_id ? 1 : 0), cell: (c) => c.line_user_id ? <Check className="h-4 w-4 text-primary" /> : <span className="text-muted-foreground">—</span> },
    { key: "status", header: "สถานะ", sortValue: (c) => c.status, cell: (c) => editing === c.id
      ? <Select defaultValue={c.status} className="h-8 w-28" id={`st-${c.id}`}>{["active", "blocked", "closed"].map((x) => <option key={x} value={x}>{statusTh(x)}</option>)}</Select>
      : <Badge variant={c.status === "active" ? "success" : c.status === "blocked" ? "destructive" : "secondary"}>{statusTh(c.status)}</Badge> },
    { key: "act", header: "", stop: true, cell: (c) => editing === c.id ? (
      <div className="flex gap-1">
        <Button size="sm" onClick={() => saveRow(c.id)}>บันทึก</Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>ยกเลิก</Button>
      </div>
    ) : (
      <div className="flex justify-end gap-1">
        <Button size="sm" onClick={() => setDetailId(c.id)}>ดู</Button>
        <Button size="sm" variant="outline" onClick={() => setEditing(c.id)}>แก้ไข</Button>
      </div>
    ) },
  ];

  return (
    <>
      {/* Daily task first: find a customer. Add/link forms live below. */}
      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <CardTitle>ลูกค้าทั้งหมด ({total})</CardTitle>
          <div className="ml-auto flex items-center gap-2">
            <label className="cursor-pointer">
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])} />
              <span className="inline-flex h-9 items-center gap-1 rounded-lg bg-background neu-raised-sm px-3.5 text-xs"><Upload className="h-3 w-3" /> นำเข้า CSV</span>
            </label>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setPage(1); setQ(search); }}>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหา รหัส/ชื่อ/เบอร์" className="w-56" />
              <Button size="sm" type="submit">ค้นหา</Button>
            </form>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable data={list.data?.items ?? []} columns={columns} rowKey={(c) => c.id} initialSort={{ key: "code", dir: "asc" }} empty="ยังไม่มีลูกค้า" loading={list.isLoading} />
          {pages > 1 && (
            <div className="flex items-center justify-end gap-2 px-4 py-3 text-sm">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>ก่อนหน้า</Button>
              <span>{page} / {pages}</span>
              <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>ถัดไป</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>เพิ่มลูกค้า</CardTitle></CardHeader>
        <CardContent>
          <form className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(e) => { create.mutate(formObj(e)); e.currentTarget.reset(); }}>
            <Field label="รหัสลูกค้า"><Input name="customer_code" placeholder="เช่น C001" required /></Field>
            <Field label="ชื่อ"><Input name="display_name" /></Field>
            <Field label="เบอร์โทร"><Input name="phone" /></Field>
            <Field label="LINE OA">
              <Select name="line_oa_id" defaultValue="">
                <option value="">— เลือก LINE OA —</option>
                {(oas.data ?? []).filter((o: any) => o.is_active).map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </Select>
            </Field>
            <Button type="submit">เพิ่มลูกค้า</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>ผูก LINE user id</CardTitle></CardHeader>
        <CardContent>
          <form className="grid grid-cols-1 items-end gap-3 sm:grid-cols-3" onSubmit={(e) => link.mutate(formObj(e))}>
            <Field label="รหัสลูกค้า"><Input name="customer_code" placeholder="เช่น C001" required /></Field>
            <Field label="LINE User ID"><Input name="line_user_id" placeholder="Uxxxxxxxx" required /></Field>
            <Button type="submit">ผูก LINE</Button>
          </form>
        </CardContent>
      </Card>

      {detailId && <CustomerDetail id={detailId} onClose={() => setDetailId(null)} />}
    </>
  );
}
