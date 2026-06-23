import { useQuery } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { apiGet, apiSend } from "@/lib/api";
import { useMut } from "@/lib/ui";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";

export function BankAccounts() {
  const { canWrite } = useAuth();
  const list = useQuery({ queryKey: ["banks"], queryFn: () => apiGet("/api/bank-accounts") });
  const create = useMut((b: any) => apiSend("/api/bank-accounts", "POST", b), { success: "เพิ่มบัญชีแล้ว", invalidate: ["banks"] });
  const setDefault = useMut((id: string) => apiSend(`/api/bank-accounts/${id}/set-default`, "PATCH"), { success: "ตั้ง default แล้ว", invalidate: ["banks"] });
  const deactivate = useMut((id: string) => apiSend(`/api/bank-accounts/${id}/deactivate`, "PATCH"), { success: "ปิดบัญชีแล้ว", invalidate: ["banks"] });

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    create.mutate({
      account_name: fd.get("account_name"),
      account_no: fd.get("account_no"),
      bank_name: fd.get("bank_name"),
      bank_code: fd.get("bank_code") || undefined,
      is_default: fd.get("is_default") === "on",
    });
    e.currentTarget.reset();
  };

  return (
    <>
      {canWrite && (
        <Card>
          <CardHeader><CardTitle>เพิ่มบัญชีรับโอน</CardTitle></CardHeader>
          <CardContent>
            <form className="flex flex-wrap items-center gap-2" onSubmit={submit}>
              <Input name="account_name" placeholder="ชื่อบัญชี" className="w-44" required />
              <Input name="account_no" placeholder="เลขบัญชี" className="w-40" required />
              <Input name="bank_name" placeholder="ธนาคาร" className="w-44" required />
              <Input name="bank_code" placeholder="code" className="w-24" />
              <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="is_default" /> default</label>
              <Button size="sm" type="submit">เพิ่ม</Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>บัญชีทั้งหมด</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <THead><TR><TH>ชื่อ</TH><TH>เลขที่</TH><TH>ธนาคาร</TH><TH></TH><TH>สถานะ</TH><TH></TH></TR></THead>
            <TBody>
              {(list.data ?? []).map((b: any) => (
                <TR key={b.id}>
                  <TD>{b.account_name}</TD>
                  <TD>{b.account_no}</TD>
                  <TD>{b.bank_name}</TD>
                  <TD>{b.is_default && <Star className="h-4 w-4 text-amber-500" />}</TD>
                  <TD><Badge variant={b.is_active ? "success" : "secondary"}>{b.is_active ? "active" : "inactive"}</Badge></TD>
                  <TD className="flex gap-1">
                    {canWrite && <Button size="sm" variant="outline" onClick={() => setDefault.mutate(b.id)}>ตั้ง default</Button>}
                    {canWrite && b.is_active && <Button size="sm" variant="destructive" onClick={() => deactivate.mutate(b.id)}>ปิด</Button>}
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
