import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Database, RefreshCw } from "lucide-react";
import { apiGet } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type UsagePoint = {
  date: string;
  used_bytes: number;
  object_count: number;
};

type UsageData = {
  configured: boolean;
  connected: boolean;
  bucket: string | null;
  quota_gb: number;
  quota_bytes: number;
  threshold_percent: number;
  metrics_days: number;
  used_bytes: number;
  used_gb: number;
  usage_percent: number;
  remaining_bytes: number;
  object_count: number;
  alert_level: "ok" | "warning" | "critical";
  backup_recommended: boolean;
  history: UsagePoint[];
  missing?: string[];
  fetched_at?: string | null;
  error?: string;
};

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1_000_000) return `${Math.round(bytes / 1_000)} KB`;
  if (bytes < 1_000_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
};

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short" }).format(date);
};

function UsageChart({ data }: { data: UsageData }) {
  const points = data.history;
  if (!points.length) {
    return <div className="flex h-52 items-center justify-center rounded-xl bg-secondary/60 text-sm text-muted-foreground">ยังไม่มีข้อมูลย้อนหลังจาก R2</div>;
  }

  const width = 720;
  const height = 250;
  const padding = { top: 18, right: 18, bottom: 32, left: 18 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxUsed = Math.max(...points.map((point) => point.used_bytes), data.quota_bytes);
  const maxValue = Math.max(maxUsed, 1);
  const x = (index: number) => padding.left + (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
  const y = (value: number) => padding.top + plotHeight - (Math.min(value, maxValue) / maxValue) * plotHeight;
  const linePoints = points.map((point, index) => `${x(index)},${y(point.used_bytes)}`).join(" ");
  const areaPath = `M ${x(0)} ${padding.top + plotHeight} L ${points.map((point, index) => `${x(index)} ${y(point.used_bytes)}`).join(" L ")} L ${x(points.length - 1)} ${padding.top + plotHeight} Z`;
  const quotaY = y(data.quota_bytes);
  const thresholdY = y(data.quota_bytes * (data.threshold_percent / 100));
  const lineColor = data.alert_level === "critical" ? "#dc2626" : data.alert_level === "warning" ? "#d97706" : "#2563eb";

  return (
    <div className="rounded-xl bg-secondary/40 p-2 sm:p-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="กราฟการใช้พื้นที่ R2">
        <line x1={padding.left} x2={width - padding.right} y1={quotaY} y2={quotaY} stroke="#dc2626" strokeDasharray="5 5" strokeOpacity="0.7" />
        <line x1={padding.left} x2={width - padding.right} y1={thresholdY} y2={thresholdY} stroke="#d97706" strokeDasharray="3 5" strokeOpacity="0.7" />
        <path d={areaPath} fill={lineColor} fillOpacity="0.12" />
        <polyline points={linePoints} fill="none" stroke={lineColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point, index) => <circle key={`${point.date}-${index}`} cx={x(index)} cy={y(point.used_bytes)} r="3.5" fill={lineColor} />)}
        <text x={width - padding.right} y={quotaY - 7} textAnchor="end" className="fill-danger-text text-[11px]">Quota {data.quota_gb} GB</text>
        <text x={width - padding.right} y={thresholdY - 7} textAnchor="end" className="fill-warning-text text-[11px]">เตือน {data.threshold_percent}%</text>
        <text x={padding.left} y={height - 8} className="fill-muted-foreground text-[11px]">{formatDate(points[0].date)}</text>
        <text x={width - padding.right} y={height - 8} textAnchor="end" className="fill-muted-foreground text-[11px]">{formatDate(points[points.length - 1].date)}</text>
      </svg>
      <div className="flex flex-wrap gap-4 px-2 pb-1 text-[11px] text-muted-foreground">
        <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-primary" />การใช้พื้นที่</span>
        <span><i className="mr-1 inline-block h-0.5 w-3 border-t border-dashed border-warning-text" />จุดแจ้งเตือน</span>
        <span><i className="mr-1 inline-block h-0.5 w-3 border-t border-dashed border-danger-text" />Quota</span>
      </div>
    </div>
  );
}

export function R2UsageMonitor() {
  const usage = useQuery<UsageData>({
    queryKey: ["r2-usage"],
    queryFn: () => apiGet<UsageData>("/api/platform/storage/usage"),
    refetchInterval: 5 * 60 * 1000,
  });
  const data = usage.data;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-primary" />
          <CardTitle>R2 Storage Monitor</CardTitle>
          {data?.connected && <Badge variant={data.alert_level === "critical" ? "destructive" : data.alert_level === "warning" ? "warning" : "success"}>{data.alert_level === "critical" ? "เกิน Quota" : data.alert_level === "warning" ? "ใกล้เต็ม" : "ปกติ"}</Badge>}
        </div>
        <Button size="sm" variant="outline" onClick={() => usage.refetch()} disabled={usage.isFetching}>
          <RefreshCw className={`h-4 w-4 ${usage.isFetching ? "animate-spin" : ""}`} /> รีเฟรช
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {!data && usage.isLoading && <p className="text-sm text-muted-foreground">กำลังอ่าน Metrics จาก R2…</p>}
        {data && !data.configured && (
          <div className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning-text">
            <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" />ยังไม่ได้ตั้งค่า R2 Metrics</div>
            <p className="mt-1">เพิ่มค่าฝั่ง server: {(data.missing ?? []).join(", ") || "Cloudflare account และ API token"}</p>
            <p className="mt-1 text-xs">API token ใช้สำหรับอ่าน Metrics เท่านั้น และไม่ถูกแสดงในหน้าเว็บ</p>
          </div>
        )}
        {data?.error && (
          <div className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger-text"><AlertTriangle className="mr-2 inline-block h-4 w-4" />{data.error}</div>
        )}
        {data?.connected && (
          <>
            {data.backup_recommended && (
              <div className={`rounded-xl px-4 py-3 text-sm ${data.alert_level === "critical" ? "bg-danger-soft text-danger-text" : "bg-warning-soft text-warning-text"}`}>
                <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" />แจ้งเตือน BK ข้อมูล</div>
                <p className="mt-1">พื้นที่ใช้ไป {data.usage_percent.toFixed(1)}% ของ quota {data.quota_gb} GB — แนะนำให้ Backup หรือย้ายไฟล์เก่าออก</p>
              </div>
            )}
            {!data.backup_recommended && <div className="flex items-center gap-2 rounded-xl bg-success-soft px-4 py-3 text-sm text-success-text"><CheckCircle2 className="h-4 w-4" />พื้นที่ยังอยู่ในระดับปกติ และต่ำกว่าจุดแจ้งเตือน</div>}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-secondary/60 p-3"><div className="text-xs text-muted-foreground">ใช้ไป</div><div className="mt-1 text-xl font-semibold">{formatBytes(data.used_bytes)}</div><div className="text-xs text-muted-foreground">{data.usage_percent.toFixed(1)}%</div></div>
              <div className="rounded-xl bg-secondary/60 p-3"><div className="text-xs text-muted-foreground">เหลือจาก quota</div><div className="mt-1 text-xl font-semibold">{formatBytes(data.remaining_bytes)}</div><div className="text-xs text-muted-foreground">จาก {data.quota_gb} GB</div></div>
              <div className="rounded-xl bg-secondary/60 p-3"><div className="text-xs text-muted-foreground">จำนวนไฟล์</div><div className="mt-1 text-xl font-semibold">{data.object_count.toLocaleString("th-TH")}</div><div className="text-xs text-muted-foreground">Bucket: {data.bucket ?? "—"}</div></div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between text-sm font-medium"><span>การใช้พื้นที่ย้อนหลัง {data.metrics_days} วัน</span><span className="text-muted-foreground">เตือนที่ {data.threshold_percent}%</span></div>
              <UsageChart data={data} />
            </div>
            {data.fetched_at && <p className="text-right text-[11px] text-muted-foreground">อัปเดตล่าสุด {new Date(data.fetched_at).toLocaleString("th-TH")}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}
