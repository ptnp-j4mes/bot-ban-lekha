import { useState } from "react";
import { toast } from "react-toastify";
import { Eye, EyeOff } from "lucide-react";
import { loginUrl, setDevKey, setToken, clearAuth } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const BASE = import.meta.env.VITE_API_BASE ?? "";

export function Login() {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [dev, setDev] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
    <div className="flex min-h-screen">
      {/* Left: ledger cover */}
      <div className="sidebar-ink hidden lg:flex lg:w-[42%] flex-col justify-between p-12">
        <div>
          <div className="font-mono text-[11px] tracking-[0.25em] text-emerald-400/60 uppercase">สมุดลูกหนี้</div>
          <div className="mt-1 text-2xl font-bold tracking-tight text-white">Bill Admin</div>
        </div>
        <div>
          <h2 className="text-emerald-50/90 text-[28px] font-bold leading-snug">
            ทวงบิลผ่าน LINE<br />รับสลิป · กระทบยอดอัตโนมัติ
          </h2>
          <div className="mt-6 space-y-2 font-mono text-[12px] text-emerald-50/40">
            <div className="flex justify-between border-b border-white/10 pb-1.5"><span>ส่งเตือนตามรอบงวด</span><span>LINE OA</span></div>
            <div className="flex justify-between border-b border-white/10 pb-1.5"><span>อ่านสลิป OCR</span><span>ตรวจก่อนอนุมัติ</span></div>
            <div className="flex justify-between"><span>กระทบยอดเข้าบิล</span><span>อัตโนมัติ</span></div>
          </div>
        </div>
        <p className="font-mono text-[10px] tracking-wider text-emerald-50/25">© {new Date().getFullYear() + 543} BILL ADMIN</p>
      </div>

      {/* Right: sign-in */}
      <div className="flex flex-1 items-center justify-center bg-background p-6">
        <div className="w-full max-w-[340px]">
          <div className="mb-7">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">เข้าสู่ระบบ</div>
            <h1 className="mt-1 text-xl font-bold tracking-tight">ลงชื่อเข้าใช้บัญชี</h1>
          </div>

          <form className="space-y-3" onSubmit={login}>
            <div>
              <label className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Username</label>
              <Input value={user} onChange={(e) => setUser(e.target.value)} required className="mt-1 h-10" autoFocus />
            </div>
            <div>
              <label className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Password</label>
              <div className="relative mt-1">
                <Input type={showPassword ? "text" : "password"} value={pass} onChange={(e) => setPass(e.target.value)} required className="h-10 pr-10" />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button className="w-full h-10" type="submit" disabled={busy}>
              {busy ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
            </Button>
          </form>

          <div className="my-5 flex items-center gap-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> หรือ <div className="h-px flex-1 bg-border" />
          </div>

          <a href={loginUrl}>
            <Button variant="outline" className="w-full h-10">เข้าสู่ระบบด้วย LINE</Button>
          </a>

          <details className="mt-5 font-mono text-[11px] text-muted-foreground">
            <summary className="cursor-pointer hover:text-foreground">dev · ใช้ API key</summary>
            <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); clearAuth(); setDevKey(dev.trim()); window.location.reload(); }}>
              <Input type="password" placeholder="ADMIN_API_KEY" value={dev} onChange={(e) => setDev(e.target.value)} className="h-9 min-w-0 flex-1" />
              <Button size="sm" type="submit">เข้า</Button>
            </form>
          </details>
        </div>
      </div>
    </div>
  );
}
