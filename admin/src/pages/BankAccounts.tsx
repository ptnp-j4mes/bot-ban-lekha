import { useMemo, useState } from "react";
import { Download, Landmark, Plus, Power, Search, SlidersHorizontal, Star, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiGet, apiSend } from "@/lib/api";
import { useMut } from "@/lib/ui";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Dialog } from "@/components/ui/dialog";

type BankTab = "all" | "active" | "default" | "inactive";

const csvCell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;

export function BankAccounts() {
  const { canWrite } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<BankTab>("all");
  const [bankFilter, setBankFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const list = useQuery({ queryKey: ["banks"], queryFn: () => apiGet("/api/bank-accounts") });
  const masters = useQuery({ queryKey: ["bank-masters"], queryFn: () => apiGet("/api/bank-accounts/master") });
  const create = useMut((b: any) => apiSend("/api/bank-accounts", "POST", b), { success: "เพิ่มบัญชีแล้ว", invalidate: ["banks"] });
  const setDefault = useMut((id: string) => apiSend(`/api/bank-accounts/${id}/set-default`, "PATCH"), { success: "ตั้ง default แล้ว", invalidate: ["banks"] });
  const deactivate = useMut((id: string) => apiSend(`/api/bank-accounts/${id}/deactivate`, "PATCH"), { success: "ปิดบัญชีแล้ว", invalidate: ["banks"] });

  const rows = (list.data ?? []) as any[];
  const bankOptions = (masters.data ?? []) as any[];
  const counts = useMemo(() => ({
    all: rows.length,
    active: rows.filter((b) => b.is_active).length,
    default: rows.filter((b) => b.is_default).length,
    inactive: rows.filter((b) => !b.is_active).length,
  }), [rows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((bank) => {
      const searchable = [bank.account_name, bank.account_no, bank.bank_master?.name, bank.bank_name, bank.bank_code, bank.branch_name]
        .filter(Boolean).join(" ").toLowerCase();
      const matchesSearch = !q || searchable.includes(q);
      const matchesTab = tab === "all"
        || (tab === "active" && bank.is_active)
        || (tab === "default" && bank.is_default)
        || (tab === "inactive" && !bank.is_active);
      const matchesBank = !bankFilter || bank.bank_master_id === bankFilter;
      const matchesStatus = statusFilter === "all"
        || (statusFilter === "active" && bank.is_active)
        || (statusFilter === "inactive" && !bank.is_active);
      return matchesSearch && matchesTab && matchesBank && matchesStatus;
    });
  }, [bankFilter, rows, search, statusFilter, tab]);

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    create.mutate({
      account_name: fd.get("account_name"),
      account_no: fd.get("account_no"),
      bank_master_id: fd.get("bank_master_id"),
      is_default: fd.get("is_default") === "on",
    }, { onSuccess: () => { form.reset(); setCreateOpen(false); } });
  };

  const toggleSelected = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const toggleAll = () => setSelected((current) => {
    const allSelected = filteredRows.length > 0 && filteredRows.every((bank) => current.has(bank.id));
    if (allSelected) return new Set();
    return new Set(filteredRows.map((bank) => bank.id));
  });

  const clearFilters = () => {
    setSearch("");
    setTab("all");
    setBankFilter("");
    setStatusFilter("all");
  };

  const exportCsv = () => {
    const header = ["ชื่อบัญชี", "เลขบัญชี", "ธนาคาร", "รหัสธนาคาร", "สาขา", "สถานะ", "บัญชีหลัก"];
    const body = filteredRows.map((bank) => [
      bank.account_name,
      bank.account_no,
      bank.bank_master?.name || bank.bank_name,
      bank.bank_master?.code || bank.bank_code,
      bank.branch_name || "-",
      bank.is_active ? "ใช้งานอยู่" : "ปิดใช้งาน",
      bank.is_default ? "ใช่" : "ไม่ใช่",
    ]);
    const csv = [header, ...body].map((row) => row.map(csvCell).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "bank-accounts.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const tabs: { id: BankTab; label: string; count: number }[] = [
    { id: "all", label: "บัญชีทั้งหมด", count: counts.all },
    { id: "active", label: "ใช้งานอยู่", count: counts.active },
    { id: "default", label: "บัญชีหลัก", count: counts.default },
    { id: "inactive", label: "ปิดใช้งาน", count: counts.inactive },
  ];

  const columns: Column<any>[] = [
    {
      key: "select",
      header: <input type="checkbox" aria-label="เลือกบัญชีทั้งหมด" checked={filteredRows.length > 0 && filteredRows.every((bank) => selected.has(bank.id))} onChange={toggleAll} />,
      stop: true,
      className: "w-10",
      cell: (bank) => <input type="checkbox" aria-label={`เลือก ${bank.account_name}`} checked={selected.has(bank.id)} onChange={() => toggleSelected(bank.id)} />,
    },
    {
      key: "name",
      header: "บัญชีรับโอน",
      sortValue: (bank) => bank.account_name,
      cell: (bank) => (
        <div className="flex min-w-[190px] items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Landmark className="h-4 w-4" /></span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <span className="truncate">{bank.account_name}</span>
              {bank.is_default && <Badge variant="warning" className="shrink-0 normal-case tracking-normal"><Star className="mr-1 h-3 w-3" />หลัก</Badge>}
            </div>
            {bank.note && <div className="truncate text-xs text-muted-foreground">{bank.note}</div>}
          </div>
        </div>
      ),
    },
    { key: "no", header: "เลขบัญชี", sortValue: (bank) => bank.account_no, cell: (bank) => <span className="fig whitespace-nowrap text-sm">{bank.account_no}</span> },
    { key: "bank", header: "ธนาคาร", sortValue: (bank) => bank.bank_master?.name || bank.bank_name, cell: (bank) => <div className="whitespace-nowrap"><div>{bank.bank_master?.name || bank.bank_name}</div><div className="fig text-[11px] text-muted-foreground">{bank.bank_master?.code || bank.bank_code || "-"}</div></div> },
    { key: "branch", header: "สาขา", sortValue: (bank) => bank.branch_name || "", cell: (bank) => <span className="text-muted-foreground">{bank.branch_name || "สำนักงานใหญ่"}</span> },
    { key: "status", header: "สถานะ", sortValue: (bank) => (bank.is_active ? 1 : 0), cell: (bank) => <Badge variant={bank.is_active ? "success" : "secondary"}>{bank.is_active ? "ใช้งานอยู่" : "ปิดใช้งาน"}</Badge> },
    {
      key: "act",
      header: "การทำงาน",
      stop: true,
      align: "right",
      cell: (bank) => (
        <div className="flex justify-end gap-1">
          {canWrite && <Button size="icon" variant="ghost" className="h-8 w-8" disabled={bank.is_default || !bank.is_active || setDefault.isPending} onClick={() => setDefault.mutate(bank.id)} aria-label={`ตั้ง ${bank.account_name} เป็นบัญชีหลัก`} title="ตั้งเป็นบัญชีหลัก"><Star className="h-4 w-4" /></Button>}
          {canWrite && bank.is_active && <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:bg-danger-soft hover:text-destructive" disabled={deactivate.isPending} onClick={() => deactivate.mutate(bank.id)} aria-label={`ปิด ${bank.account_name}`} title="ปิดบัญชี"><Power className="h-4 w-4" /></Button>}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {canWrite && (
        <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="เพิ่มบัญชีรับโอน" className="max-w-xl">
          <form className="space-y-4" onSubmit={submit}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="ชื่อบัญชี"><Input name="account_name" autoFocus required /></Field>
              <Field label="เลขบัญชี"><Input name="account_no" required /></Field>
              <Field label="ธนาคาร" className="sm:col-span-2">
                <Select name="bank_master_id" required defaultValue="">
                  <option value="" disabled>เลือกธนาคาร</option>
                  {bankOptions.map((bank) => <option key={bank.id} value={bank.id}>{bank.name} ({bank.code})</option>)}
                </Select>
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_default" /> ตั้งเป็นบัญชีหลัก</label>
            <Button type="submit" className="w-full" disabled={create.isPending}>เพิ่มบัญชี</Button>
          </form>
        </Dialog>
      )}

      <Card className="overflow-hidden">
        <CardContent className="space-y-4 p-4 md:p-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาชื่อบัญชี เลขบัญชี หรือธนาคาร" className="h-11 pl-10 pr-10" aria-label="ค้นหาบัญชีรับโอน" />
              {search && <button type="button" onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="ล้างคำค้น"><X className="h-4 w-4" /></button>}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="h-11" onClick={() => setFiltersOpen((open) => !open)}><SlidersHorizontal className="h-4 w-4" /> ตัวกรอง{(bankFilter || statusFilter !== "all") && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] text-primary-foreground">{Number(!!bankFilter) + Number(statusFilter !== "all")}</span>}</Button>
              <Button type="button" variant="outline" className="h-11" onClick={exportCsv} disabled={!filteredRows.length}><Download className="h-4 w-4" /> Export</Button>
              {canWrite && <Button type="button" className="h-11" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> เพิ่มบัญชี</Button>}
            </div>
          </div>

          <div className="flex overflow-x-auto rounded-xl border border-border p-1">
            {tabs.map((item) => (
              <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`min-w-[145px] flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${tab === item.id ? "bg-primary/10 text-primary shadow-sm" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>
                {item.label} <span className="ml-1 text-xs opacity-70">({item.count})</span>
              </button>
            ))}
          </div>

          {filtersOpen && (
            <div className="grid grid-cols-1 gap-3 rounded-xl bg-secondary/60 p-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
              <Field label="ธนาคาร"><Select value={bankFilter} onChange={(e) => setBankFilter(e.target.value)}><option value="">ธนาคารทั้งหมด</option>{bankOptions.map((bank) => <option key={bank.id} value={bank.id}>{bank.name} ({bank.code})</option>)}</Select></Field>
              <Field label="สถานะ"><Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="all">ทุกสถานะ</option><option value="active">ใช้งานอยู่</option><option value="inactive">ปิดใช้งาน</option></Select></Field>
              <Button type="button" variant="ghost" className="h-[42px]" onClick={clearFilters}>ล้างตัวกรอง</Button>
            </div>
          )}

          <div className="flex min-h-8 flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>แสดง {filteredRows.length} จาก {rows.length} บัญชี</span>
            {selected.size > 0 && <button type="button" className="font-semibold text-primary hover:underline" onClick={() => setSelected(new Set())}>เลือกอยู่ {selected.size} รายการ · ล้างการเลือก</button>}
          </div>
        </CardContent>
        <div className="border-t border-border">
          <DataTable data={filteredRows} columns={columns} rowKey={(bank) => bank.id} initialSort={{ key: "name", dir: "asc" }} empty={list.isLoading ? "กำลังโหลด…" : "ยังไม่มีบัญชีรับโอน ลองเพิ่มบัญชีแรกได้เลย"} loading={list.isLoading} maxHeight="60vh" />
        </div>
      </Card>
    </div>
  );
}
