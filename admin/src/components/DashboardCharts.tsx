import { baht } from "@/lib/format";

export type DashboardChartPoint = {
  month: number;
  total: number;
  collected: number;
  uncollected: number;
};

export type DashboardChartData = {
  period: "month" | "year";
  year: number;
  month: number | null;
  pie: DashboardChartPoint;
  monthly: DashboardChartPoint[];
};

const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const PLOT = { left: 48, right: 12, top: 16, bottom: 34, width: 760, height: 280 };

const compactAmount = (value: number) => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} ลบ.`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return Math.round(value).toLocaleString("th-TH");
};

const maxFor = (values: number[]) => Math.max(1, ...values, 0);

function Grid({ max }: { max: number }) {
  const plotHeight = PLOT.height - PLOT.top - PLOT.bottom;
  return (
    <>
      {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
        const y = PLOT.top + plotHeight * (1 - fraction);
        return (
          <g key={fraction}>
            <line x1={PLOT.left} x2={PLOT.width - PLOT.right} y1={y} y2={y} stroke="currentColor" strokeOpacity="0.12" />
            <text x={PLOT.left - 8} y={y + 4} textAnchor="end" className="fill-muted-foreground text-[11px]">{compactAmount(max * fraction)}</text>
          </g>
        );
      })}
    </>
  );
}

function MonthLabels({ points }: { points: DashboardChartPoint[] }) {
  const plotWidth = PLOT.width - PLOT.left - PLOT.right;
  const step = plotWidth / points.length;
  return (
    <>
      {points.map((point, index) => (
        <text key={point.month} x={PLOT.left + step * index + step / 2} y={PLOT.height - 10} textAnchor="middle" className="fill-muted-foreground text-[11px]">
          {MONTHS[point.month - 1]}
        </text>
      ))}
    </>
  );
}

export function DashboardPieChart({ data }: { data: DashboardChartPoint }) {
  const total = Math.max(0, data.collected + data.uncollected);
  const collectedPercent = total > 0 ? (data.collected / total) * 100 : 0;
  const uncollectedPercent = total > 0 ? (data.uncollected / total) * 100 : 0;
  const background = total > 0
    ? `conic-gradient(#059669 0 ${collectedPercent}%, #f59e0b ${collectedPercent}% 100%)`
    : "#e2e8f0";

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3">
        <h3 className="font-head text-sm font-semibold">สัดส่วนยอดเก็บ</h3>
        <p className="text-xs text-muted-foreground">เก็บแล้วเทียบกับยอดที่ยังเก็บไม่ครบ</p>
      </div>
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:justify-center">
        <div className="relative h-44 w-44 shrink-0 rounded-full" style={{ background }} role="img" aria-label={`เก็บแล้ว ${baht(data.collected)} บาท ยังเก็บไม่ครบ ${baht(data.uncollected)} บาท`}>
          <div className="absolute inset-7 flex flex-col items-center justify-center rounded-full bg-card text-center">
            <span className="text-xs text-muted-foreground">รวม</span>
            <span className="fig mt-1 text-sm font-semibold">{baht(total)}</span>
          </div>
        </div>
        <div className="w-full max-w-xs space-y-3 text-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-emerald-600" />เก็บแล้ว</div>
            <div className="text-right"><div className="fig font-semibold">{baht(data.collected)}</div><div className="text-xs text-muted-foreground">{collectedPercent.toFixed(1)}%</div></div>
          </div>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-amber-500" />ยังเก็บไม่ครบ</div>
            <div className="text-right"><div className="fig font-semibold">{baht(data.uncollected)}</div><div className="text-xs text-muted-foreground">{uncollectedPercent.toFixed(1)}%</div></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DashboardMonthlyTotalChart({ points }: { points: DashboardChartPoint[] }) {
  const max = maxFor(points.map((point) => point.total));
  const plotHeight = PLOT.height - PLOT.top - PLOT.bottom;
  const plotWidth = PLOT.width - PLOT.left - PLOT.right;
  const step = plotWidth / points.length;
  const barWidth = Math.min(38, step * 0.58);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3">
        <h3 className="font-head text-sm font-semibold">ยอดรวมแต่ละเดือน</h3>
        <p className="text-xs text-muted-foreground">ยอดงวดทั้งหมดตามเดือนครบกำหนด</p>
      </div>
      <svg viewBox={`0 0 ${PLOT.width} ${PLOT.height}`} className="h-64 w-full" role="img" aria-label="กราฟยอดรวมแต่ละเดือน">
        <Grid max={max} />
        {points.map((point, index) => {
          const height = (point.total / max) * plotHeight;
          const x = PLOT.left + step * index + (step - barWidth) / 2;
          const y = PLOT.top + plotHeight - height;
          return (
            <g key={point.month}>
              <title>{`${MONTHS[point.month - 1]}: ${baht(point.total)} บาท`}</title>
              <rect x={x} y={y} width={barWidth} height={Math.max(0, height)} rx="5" className="fill-sky-500/80" />
            </g>
          );
        })}
        <MonthLabels points={points} />
      </svg>
    </div>
  );
}

export function DashboardMonthlyComparisonChart({ points }: { points: DashboardChartPoint[] }) {
  const max = maxFor(points.flatMap((point) => [point.collected, point.uncollected]));
  const plotHeight = PLOT.height - PLOT.top - PLOT.bottom;
  const plotWidth = PLOT.width - PLOT.left - PLOT.right;
  const step = plotWidth / points.length;
  const yFor = (value: number) => PLOT.top + plotHeight - (value / max) * plotHeight;
  const xFor = (index: number) => PLOT.left + step * index + step / 2;
  const line = (key: "collected" | "uncollected") => points.map((point, index) => `${xFor(index)},${yFor(point[key])}`).join(" ");

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-head text-sm font-semibold">เก็บได้และยังเก็บไม่ได้รายเดือน</h3>
          <p className="text-xs text-muted-foreground">เปรียบเทียบยอดเก็บแล้วกับยอดคงเหลือ</p>
        </div>
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />เก็บแล้ว</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" />ยังไม่ได้เก็บ</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${PLOT.width} ${PLOT.height}`} className="h-64 w-full" role="img" aria-label="กราฟเปรียบเทียบยอดเก็บได้และยังไม่ได้เก็บรายเดือน">
        <Grid max={max} />
        <polyline points={line("collected")} fill="none" stroke="#059669" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={line("uncollected")} fill="none" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point, index) => (
          <g key={point.month}>
            <title>{`${MONTHS[point.month - 1]}: เก็บแล้ว ${baht(point.collected)} บาท, ยังไม่ได้เก็บ ${baht(point.uncollected)} บาท`}</title>
            <circle cx={xFor(index)} cy={yFor(point.collected)} r="4" className="fill-emerald-600" />
            <circle cx={xFor(index)} cy={yFor(point.uncollected)} r="4" className="fill-amber-500" />
          </g>
        ))}
        <MonthLabels points={points} />
      </svg>
    </div>
  );
}
