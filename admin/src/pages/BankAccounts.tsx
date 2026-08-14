import { useQuery } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { apiGet, apiSend } from "@/lib/api";
import { useMut } from "@/lib/ui";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";

export function BankAccounts() {
  const { canWrite } = useAuth();
  const list = useQuery({ queryKey: ["banks"], queryFn: () => apiGet("/api/bank-accounts") });
  const masters = useQuery({ queryKey: ["bank-masters"], queryFn: () => apiGet("/api/bank-accounts/master") });
  const create = useMut((b: any) => apiSend("/api/bank-accounts", "POST", b), { success: "เพิ่มบัญชีแล้ว", invalidate: ["banks"] });
  const setDefault = useMut((id: string) => apiSend(`/api/bank-accounts/${id}/set-default`, "PATCH"), { success: "ตั้ง default แล้ว", invalidate: ["banks"] });
  const deactivate = useMut((id: string) => apiSend(`/api/bank-accounts/${id}/deactivate`, "PATCH"), { success: "ปิดบัญชีแล้ว", invalidate: ["banks"] });

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    create.mutate({
      account_name: fd.get("account_name"),
      account_no: fd.get("account_no"),
      bank_master_id: fd.get("bank_master_id"),
      is_default: fd.get("is_default") === "on",
    });
    e.currentTarget.reset();
  };

  const columns: Column<any>[] = [
    { key: "name", header: "ชื่อ", sortValue: (b) => b.account_name, cell: (b) => <span className="flex items-center gap-1.5">{b.is_default && <Star className="h-3.5 w-3.5 text-amber-500" />}{b.account_name}</span> },
    { key: "no", header: "เลขที่", sortValue: (b) => b.account_no, cell: (b) => <span className="fig">{b.account_no}</span> },
    { key: "bank", header: "ธนาคาร", sortValue: (b) => b.bank_master?.name || b.bank_name, cell: (b) => <span>{b.bank_master?.name || b.bank_name} <span className="text-muted-foreground">({b.bank_master?.code || b.bank_code || "-"})</span></span> },
    { key: "status", header: "สถานะ", sortValue: (b) => (b.is_active ? 1 : 0), cell: (b) => <Badge variant={b.is_active ? "success" : "secondary"}>{b.is_active ? "active" : "inactive"}</Badge> },
    { key: "act", header: "", stop: true, cell: (b) => (
      <div className="flex justify-end gap-1">
        {canWrite && <Button size="sm" variant="outline" onClick={() => setDefault.mutate(b.id)}>ตั้ง default</Button>}
        {canWrite && b.is_active && <Button size="sm" variant="destructive" onClick={() => deactivate.mutate(b.id)}>ปิด</Button>}
      </div>
    ) },
  ];

  return (
    <>
      {canWrite && (
        <Card>
          <CardHeader><CardTitle>เพิ่มบัญชีรับโอน</CardTitle></CardHeader>
          <CardContent>
            <form className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={submit}>
              <Field label="ชื่อบัญชี"><Input name="account_name" required /></Field>
              <Field label="เลขบัญชี"><Input name="account_no" required /></Field>
              <Field label="ธนาคาร">
                <Select name="bank_master_id" required defaultValue="">
                  <option value="" disabled>เลือกธนาคาร</option>
                  {(masters.data ?? []).map((bank: any) => <option key={bank.id} value={bank.id}>{bank.name} ({bank.code})</option>)}
                </Select>
              </Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_default" /> ตั้งเป็นบัญชีหลัก</label>
              <Button type="submit">เพิ่มบัญชี</Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>บัญชีทั้งหมด</CardTitle></CardHeader>
        <CardContent className="p-0">
          <DataTable data={list.data ?? []} columns={columns} rowKey={(b) => b.id} initialSort={{ key: "name", dir: "asc" }} empty="ยังไม่มีบัญชีรับโอน" />
        </CardContent>
      </Card>
    </>
  );
}
