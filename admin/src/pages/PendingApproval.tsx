import { LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export function PendingApproval() {
  const { logout } = useAuth();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-7 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">…</div>
        <h1 className="mt-5 text-xl font-bold">รออนุมัติสิทธิ์เข้าใช้งาน</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">บัญชี LINE นี้เข้าสู่ระบบแล้ว กรุณารอ Super Admin กำหนดองค์กรและเมนูที่อนุญาตให้ใช้งาน</p>
        <Button variant="outline" className="mt-6" onClick={logout}><LogOut className="mr-2 h-4 w-4" />ออกจากระบบ</Button>
      </div>
    </div>
  );
}
