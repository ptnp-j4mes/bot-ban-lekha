import { useQuery } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { LogIn } from "lucide-react";
import { apiGet, apiSend } from "@/lib/api";
import { useMut } from "@/lib/ui";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { usePrompt } from "@/components/ui/confirm";

// Super-admin console: manage users + the org each operates in, and "enter" a user's org.
export function Users() {
  const { enterOrg } = useAuth();
  const prompt = usePrompt();
  const users = useQuery({ queryKey: ["admin-users"], queryFn: () => apiGet("/api/platform/admin-users") });
  const orgs = useQuery({ queryKey: ["orgs"], queryFn: () => apiGet("/api/platform/organizations") });

  const create = useMut((b: any) => apiSend("/api/platform/admin-users", "POST", b), { success: "สร้างผู้ใช้แล้ว", invalidate: ["admin-users", "orgs"] });
  const update = useMut((b: { id: string; data: any }) => apiSend(`/api/platform/admin-users/${b.id}`, "PATCH", b.data), { success: "อัปเดตแล้ว", invalidate: ["admin-users", "orgs"] });
  const resetPassword = async (user: any) => {
    const password = await prompt({ title: "รีเซ็ตรหัสผ่าน", message: `กำหนดรหัสผ่านใหม่สำหรับ ${user.display_name || user.username}`, placeholder: "รหัสผ่านใหม่", confirmLabel: "บันทึก" });
    if (password) update.mutate({ id: user.id, data: { password } });
  };

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

  const columns: Column<any>[] = [
    { key: "name", header: "ชื่อ / login", sortValue: (u) => u.display_name || u.username, cell: (u) => <div>{u.display_name || "—"}<div className="text-xs text-muted-foreground">@{u.username}</div></div> },
    { key: "org", header: "org", stop: true, sortValue: (u) => u.org?.name ?? "", cell: (u) => u.is_platform_admin ? <span className="text-muted-foreground">—</span> : (
      <Select value={u.org?.id ?? ""} className="h-8 w-40" onChange={(e) => update.mutate({ id: u.id, data: { org_id: e.target.value } })}>
        <option value="" disabled>— เลือก org —</option>{orgOptions}
      </Select>
    ) },
    { key: "role", header: "สิทธิ์", sortValue: (u) => (u.is_platform_admin ? 0 : 1), cell: (u) => u.is_platform_admin ? <Badge variant="warning">super admin</Badge> : <Badge variant="secondary">user</Badge> },
    { key: "status", header: "สถานะ", sortValue: (u) => (u.is_active ? 1 : 0), cell: (u) => <Badge variant={u.is_active ? "success" : "secondary"}>{u.is_active ? "active" : "off"}</Badge> },
    { key: "login", header: "เข้าใช้ล่าสุด", sortValue: (u) => u.last_login_at ?? "", cell: (u) => <span className="text-xs">{u.last_login_at?.slice(0, 10) ?? "—"}</span> },
    { key: "act", header: "", stop: true, cell: (u) => (
      <div className="flex justify-end gap-1">
        {u.org && <Button size="sm" onClick={() => enterOrg(u.org)}><LogIn className="h-3 w-3 mr-1" /> เข้าจัดการ</Button>}
        <Button size="sm" variant="outline" onClick={() => void resetPassword(u)}>รีเซ็ตรหัส</Button>
        <Button size="sm" variant={u.is_active ? "destructive" : "success"} onClick={() => update.mutate({ id: u.id, data: { is_active: !u.is_active } })}>{u.is_active ? "ปิด" : "เปิด"}</Button>
      </div>
    ) },
  ];

  return (
    <>
      <Card>
        <CardHeader><CardTitle>สร้างผู้ใช้</CardTitle></CardHeader>
        <CardContent>
          <form className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-3" onSubmit={submit}>
            <Field label="Username"><Input name="username" required /></Field>
            <Field label="Password"><Input name="password" type="password" required /></Field>
            <Field label="ชื่อ (ไม่บังคับ)"><Input name="display_name" /></Field>
            <Field label="Org เดิม"><Select name="org_id" defaultValue=""><option value="">— เลือก org เดิม —</option>{orgOptions}</Select></Field>
            <Field label="หรือสร้าง Org ใหม่"><Input name="org_name" placeholder="ชื่อองค์กรใหม่" /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_platform_admin" /> super admin</label>
            <Button type="submit" className="w-fit">สร้างผู้ใช้</Button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">user 1 คน อยู่ 1 org; super admin ไม่ต้องมี org</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>ผู้ใช้ทั้งหมด</CardTitle></CardHeader>
        <CardContent className="p-0">
          <DataTable data={users.data ?? []} columns={columns} rowKey={(u) => u.id} initialSort={{ key: "name", dir: "asc" }} empty="ยังไม่มีผู้ใช้" />
        </CardContent>
      </Card>
    </>
  );
}
