import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { LogIn } from "lucide-react";
import { apiGet, apiSend } from "@/lib/api";
import { useMut } from "@/lib/ui";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";

// Super-admin console: manage users + the org each operates in, and "enter" a user's org.
export function Users() {
  const { enterOrg } = useAuth();
  const users = useQuery({ queryKey: ["admin-users"], queryFn: () => apiGet("/api/platform/admin-users") });
  const orgs = useQuery({ queryKey: ["orgs"], queryFn: () => apiGet("/api/platform/organizations") });

  const create = useMut((b: any) => apiSend("/api/platform/admin-users", "POST", b), { success: "สร้างผู้ใช้แล้ว", invalidate: ["admin-users", "orgs"] });
  const update = useMut((b: { id: string; data: any }) => apiSend(`/api/platform/admin-users/${b.id}`, "PATCH", b.data), { success: "อัปเดตแล้ว", invalidate: ["admin-users", "orgs"] });

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const isPlatform = fd.get("is_platform_admin") === "on";
    const body: any = {
      username: fd.get("username"),
      password: fd.get("password"),
      display_name: fd.get("display_name") || undefined,
      is_platform_admin: isPlatform,
    };
    if (!isPlatform) {
      const orgId = fd.get("org_id") as string;
      const orgName = (fd.get("org_name") as string)?.trim();
      if (orgName) body.org_name = orgName;
      else if (orgId) body.org_id = orgId;
      else return toast.error("เลือก org เดิม หรือพิมพ์ชื่อ org ใหม่");
    }
    create.mutate(body);
    e.currentTarget.reset();
  };

  const orgOptions = (orgs.data ?? []).map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>);

  return (
    <>
      <Card>
        <CardHeader><CardTitle>สร้างผู้ใช้</CardTitle></CardHeader>
        <CardContent>
          <form className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2" onSubmit={submit}>
            <Input name="username" placeholder="username" required />
            <Input name="password" type="password" placeholder="password" required />
            <Input name="display_name" placeholder="ชื่อ (ไม่บังคับ)" />
            <Select name="org_id" defaultValue=""><option value="">— เลือก org เดิม —</option>{orgOptions}</Select>
            <Input name="org_name" placeholder="หรือสร้าง org ใหม่ (ชื่อ)" />
            <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="is_platform_admin" /> super admin</label>
            <Button size="sm" type="submit" className="w-fit">สร้าง</Button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">user 1 คน อยู่ 1 org; super admin ไม่ต้องมี org</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>ผู้ใช้ทั้งหมด</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <THead><TR><TH>ชื่อ / login</TH><TH>org</TH><TH>สิทธิ์</TH><TH>สถานะ</TH><TH>เข้าใช้ล่าสุด</TH><TH></TH></TR></THead>
            <TBody>
              {(users.data ?? []).map((u: any) => (
                <TR key={u.id}>
                  <TD>{u.display_name || "—"}<div className="text-xs text-muted-foreground">@{u.username}</div></TD>
                  <TD>
                    {u.is_platform_admin ? <span className="text-muted-foreground">—</span> : (
                      <Select value={u.org?.id ?? ""} className="h-8 w-40" onChange={(e) => update.mutate({ id: u.id, data: { org_id: e.target.value } })}>
                        <option value="" disabled>— เลือก org —</option>{orgOptions}
                      </Select>
                    )}
                  </TD>
                  <TD>{u.is_platform_admin ? <Badge variant="warning">super admin</Badge> : <Badge variant="secondary">user</Badge>}</TD>
                  <TD><Badge variant={u.is_active ? "success" : "secondary"}>{u.is_active ? "active" : "off"}</Badge></TD>
                  <TD className="text-xs">{u.last_login_at?.slice(0, 10) ?? "—"}</TD>
                  <TD className="flex gap-1">
                    {!u.is_platform_admin && u.org && (
                      <Button size="sm" onClick={() => enterOrg(u.org)}><LogIn className="h-3 w-3 mr-1" /> เข้าจัดการ</Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => { const p = prompt("รหัสผ่านใหม่:"); if (p) update.mutate({ id: u.id, data: { password: p } }); }}>รีเซ็ตรหัส</Button>
                    <Button size="sm" variant={u.is_active ? "destructive" : "success"} onClick={() => update.mutate({ id: u.id, data: { is_active: !u.is_active } })}>{u.is_active ? "ปิด" : "เปิด"}</Button>
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
