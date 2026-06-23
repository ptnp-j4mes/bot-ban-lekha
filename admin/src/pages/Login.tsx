import { useState } from "react";
import { toast } from "sonner";
import { loginUrl, setDevKey, setToken, clearAuth } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

const BASE = import.meta.env.VITE_API_BASE ?? "";

export function Login() {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [dev, setDev] = useState("");
  const [busy, setBusy] = useState(false);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(`${BASE}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: user, password: pass }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || "login failed");
      clearAuth();
      setToken(json.data.token);
      window.location.reload();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="space-y-4 p-6">
          <h1 className="text-center text-xl font-bold">💸 Bill Admin</h1>

          <form className="space-y-2" onSubmit={login}>
            <Input placeholder="username" value={user} onChange={(e) => setUser(e.target.value)} required />
            <Input type="password" placeholder="password" value={pass} onChange={(e) => setPass(e.target.value)} required />
            <Button className="w-full" type="submit" disabled={busy}>{busy ? "กำลังเข้า…" : "เข้าสู่ระบบ"}</Button>
          </form>

          <div className="text-center text-xs text-muted-foreground">หรือ</div>
          <a href={loginUrl} className="block">
            <Button variant="outline" className="w-full">เข้าสู่ระบบด้วย LINE</Button>
          </a>

          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">dev: ใช้ API key</summary>
            <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); clearAuth(); setDevKey(dev.trim()); window.location.reload(); }}>
              <Input type="password" placeholder="ADMIN_API_KEY" value={dev} onChange={(e) => setDev(e.target.value)} />
              <Button size="sm" type="submit">เข้า</Button>
            </form>
          </details>
        </CardContent>
      </Card>
    </div>
  );
}
