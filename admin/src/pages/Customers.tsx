import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Download, Eye, Pencil, Plus, SlidersHorizontal, Upload, X } from "lucide-react";
import { toast } from "react-toastify";
import { apiGet, apiSend } from "@/lib/api";
import { useMut, statusTh } from "@/lib/ui";
import { CustomerDetail } from "./CustomerDetail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Dialog } from "@/components/ui/dialog";

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
  const [createOpen, setCreateOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const list = useQuery({ queryKey: ["customers", q, page, statusFilter], queryFn: () => apiGet(`/api/customers?limit=${LIMIT}&page=${page}&search=${encodeURIComponent(q)}${statusFilter === "all" ? "" : `&status=${statusFilter}`}`) });
  const counts = useQuery<{ all: number; active: number; blocked: number; closed: number }>({
    queryKey: ["customer-counts"],
    queryFn: async () => {
      const statuses = ["active", "blocked", "closed"];
      const [all, ...byStatus] = await Promise.all([
        apiGet("/api/customers?limit=1&page=1"),
        ...statuses.map((status) => apiGet(`/api/customers?limit=1&page=1&status=${status}`)),
      ]);
      return { all: all.total ?? 0, active: byStatus[0]?.total ?? 0, blocked: byStatus[1]?.total ?? 0, closed: byStatus[2]?.total ?? 0 };
    },
  });
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
  const rows = list.data?.items ?? [];
  const pages = Math.max(1, Math.ceil(total / LIMIT));

  const exportCsv = () => {
    const header = ["รหัสลูกค้า", "ชื่อ", "เบอร์โทร", "LINE", "สถานะ"];
    const body = rows.map((c: any) => [c.customer_code, c.display_name, c.phone, c.line_user_id ? "เชื่อมแล้ว" : "ยังไม่เชื่อม", statusTh(c.status)]);
    const csv = [header, ...body].map((row) => row.map((value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "customers.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const tabs = [
    { id: "all", label: "ลูกค้าทั้งหมด", count: counts.data?.all ?? total },
    { id: "active", label: "ใช้งานอยู่", count: counts.data?.active ?? 0 },
    { id: "blocked", label: "บล็อก", count: counts.data?.blocked ?? 0 },
    { id: "closed", label: "ปิดบัญชี", count: counts.data?.closed ?? 0 },
  ];

  const toggleSelected = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAll = () => setSelected((current) => rows.length > 0 && rows.every((c: any) => current.has(c.id)) ? new Set() : new Set(rows.map((c: any) => c.id)));

  const saveRow = (id: string) => {
    const dn = (document.getElementById(`dn-${id}`) as HTMLInputElement).value;
    const ph = (document.getElementById(`ph-${id}`) as HTMLInputElement).value;
    const st = (document.getElementById(`st-${id}`) as HTMLSelectElement).value;
    update.mutate({ id, data: { display_name: dn, phone: ph, status: st } });
    setEditing(null);
  };

  const submitCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    create.mutate(Object.fromEntries(new FormData(form).entries()), { onSuccess: () => { form.reset(); setCreateOpen(false); } });
  };

  const columns: Column<any>[] = [
    { key: "sel", header: <input type="checkbox" aria-label="เลือกทั้งหมด" checked={rows.length > 0 && rows.every((c: any) => selected.has(c.id))} onChange={toggleAll} />, stop: true, className: "w-10", cell: (c) => <input type="checkbox" aria-label={`เลือก ${c.display_name || c.customer_code}`} checked={selected.has(c.id)} onChange={() => toggleSelected(c.id)} /> },
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
    { key: "act", header: "การทำงาน", stop: true, align: "right", cell: (c) => editing === c.id ? (
      <div className="flex gap-1">
        <Button size="sm" onClick={() => saveRow(c.id)}>บันทึก</Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>ยกเลิก</Button>
      </div>
    ) : (
      <div className="flex justify-end gap-1">
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setDetailId(c.id)} aria-label={`ดู ${c.display_name || c.customer_code}`} title="ดูรายละเอียด"><Eye className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(c.id)} aria-label={`แก้ไข ${c.display_name || c.customer_code}`} title="แก้ไข"><Pencil className="h-4 w-4" /></Button>
      </div>
    ) },
  ];

  return (
    <>
      <Card className="overflow-hidden">
        <CardContent className="space-y-4 p-4 md:p-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <form className="relative min-w-0 flex-1" onSubmit={(e) => { e.preventDefault(); setPage(1); setQ(search); }}>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหารหัส ชื่อ หรือเบอร์โทร" className="h-11 pr-10" aria-label="ค้นหาลูกค้า" />
              {search && <button type="button" onClick={() => { setSearch(""); setQ(""); setPage(1); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="ล้างคำค้น"><X className="h-4 w-4" /></button>}
            </form>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="h-11" onClick={() => setFiltersOpen((open) => !open)}><SlidersHorizontal className="h-4 w-4" /> ตัวกรอง{statusFilter !== "all" && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] text-primary-foreground">1</span>}</Button>
              <Button type="button" variant="outline" className="h-11" onClick={exportCsv} disabled={!rows.length}><Download className="h-4 w-4" /> Export</Button>
              <label className="cursor-pointer"><input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])} /><span className="inline-flex h-11 items-center gap-2 rounded-lg border border-primary bg-transparent px-4 text-sm font-semibold text-primary hover:bg-primary/10"><Upload className="h-4 w-4" /> นำเข้า CSV</span></label>
              <Button type="button" className="h-11" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> เพิ่มลูกค้า</Button>
            </div>
          </div>

          <div className="flex overflow-x-auto rounded-xl border border-border p-1">
            {tabs.map((item) => <button key={item.id} type="button" onClick={() => { setStatusFilter(item.id); setPage(1); setSelected(new Set()); }} className={`min-w-[135px] flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${statusFilter === item.id ? "bg-primary/10 text-primary shadow-sm" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>{item.label} <span className="ml-1 text-xs opacity-70">({item.count})</span></button>)}
          </div>

          {filtersOpen && <div className="grid grid-cols-1 gap-3 rounded-xl bg-secondary/60 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"><Field label="สถานะ"><Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}><option value="all">ทุกสถานะ</option><option value="active">ใช้งานอยู่</option><option value="blocked">บล็อก</option><option value="closed">ปิดบัญชี</option></Select></Field><Button type="button" variant="ghost" className="h-[42px]" onClick={() => { setStatusFilter("all"); setPage(1); }}>ล้างตัวกรอง</Button></div>}

          <div className="flex min-h-8 flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>แสดง {rows.length} จาก {total} ลูกค้า</span>{selected.size > 0 && <button type="button" className="font-semibold text-primary hover:underline" onClick={() => setSelected(new Set())}>เลือกอยู่ {selected.size} รายการ · ล้างการเลือก</button>}</div>
        </CardContent>
        <div className="border-t border-border">
          <DataTable data={rows} columns={columns} rowKey={(c) => c.id} initialSort={{ key: "code", dir: "asc" }} empty="ยังไม่มีลูกค้า" loading={list.isLoading} />
          {pages > 1 && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3 text-sm"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>ก่อนหน้า</Button><span>{page} / {pages}</span><Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>ถัดไป</Button></div>}
        </div>
      </Card>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="เพิ่มลูกค้า" className="max-w-4xl">
        <form className="space-y-4" onSubmit={submitCreate}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="รหัสลูกค้า"><Input name="customer_code" placeholder="เช่น C001" autoFocus required /></Field>
            <Field label="ชื่อ"><Input name="display_name" /></Field>
            <Field label="เบอร์โทร"><Input name="phone" /></Field>
            <Field label="อีเมล"><Input name="email" type="email" /></Field>
            <Field label="Facebook"><Input name="facebook_url" placeholder="ชื่อบัญชีหรือ URL Facebook" /></Field>
            <Field label="LINE OA">
              <Select name="line_oa_id" defaultValue="">
                <option value="">— เลือก LINE OA —</option>
                {(oas.data ?? []).filter((o: any) => o.is_active).map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </Select>
            </Field>
            <Field label="ที่อยู่" className="sm:col-span-2"><textarea name="address" rows={2} className="w-full rounded-lg border border-border bg-card px-3.5 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-primary/10" /></Field>
            <Field label="ข้อมูลติดต่อเพิ่มเติม" className="sm:col-span-2"><textarea name="contact_note" rows={2} placeholder="เช่น ผู้ติดต่อสำรอง หรือช่องทางติดต่ออื่น" className="w-full rounded-lg border border-border bg-card px-3.5 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-primary/10" /></Field>
          </div>
          <Button type="submit" className="w-full" disabled={create.isPending}>เพิ่มลูกค้า</Button>
        </form>
      </Dialog>

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
