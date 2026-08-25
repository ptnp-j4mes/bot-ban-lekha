import { Fragment, type ReactNode } from 'react';
import { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import Svg from 'react-native-svg';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import type { DashboardChartData, DashboardChartPoint } from '../../../../shared/src/types';
import { formatBaht } from '../../../../shared/src/format';
import { font, useColors } from '../../../../shared/src/theme';

const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const CHART_WIDTH = 360;
const CHART_HEIGHT = 190;
const PLOT = { left: 34, right: 8, top: 16, bottom: 30 };

const compactAmount = (value: number) => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} ลบ.`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return Math.round(value).toLocaleString('th-TH');
};

const maxFor = (values: number[]) => Math.max(1, ...values, 0);

type ChartCoordinate = { x: number; y: number };

function smoothPath(points: ChartCoordinate[]) {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  return points.slice(1).reduce((path, point, index) => {
    const previous = points[index];
    const controlX = (previous.x + point.x) / 2;
    return `${path} C ${controlX} ${previous.y}, ${controlX} ${point.y}, ${point.x} ${point.y}`;
  }, `M ${points[0].x} ${points[0].y}`);
}

function areaPath(points: ChartCoordinate[], baseline: number) {
  if (!points.length) return '';
  return `${smoothPath(points)} L ${points[points.length - 1].x} ${baseline} L ${points[0].x} ${baseline} Z`;
}

function ChartPanel({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const colors = useColors();
  return <View style={[styles.chartPanel, { backgroundColor: colors.paper, borderColor: colors.dashboardBorder }, style]}>{children}</View>;
}

function ChartHeading({ title, description }: { title: string; description: string }) {
  const colors = useColors();
  return <View style={styles.chartHeading}><Text style={[styles.chartTitle, { color: colors.dashboardText }]}>{title}</Text><Text style={[styles.chartDescription, { color: colors.dashboardTextSecondary }]}>{description}</Text></View>;
}

function Grid({ max }: { max: number }) {
  const colors = useColors();
  const plotHeight = CHART_HEIGHT - PLOT.top - PLOT.bottom;
  return <>
    {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
      const y = PLOT.top + plotHeight * (1 - fraction);
      return <Fragment key={fraction}><SvgText x={PLOT.left - 7} y={y + 4} textAnchor="end" fontFamily={font('sans')} fontSize="10" fill={colors.dashboardTextMuted}>{compactAmount(max * fraction)}</SvgText><Line x1={PLOT.left} x2={CHART_WIDTH - PLOT.right} y1={y} y2={y} stroke={colors.dashboardBorder} strokeDasharray="4 4" strokeWidth="1" /></Fragment>;
    })}
  </>;
}

function MonthLabels({ points }: { points: DashboardChartPoint[] }) {
  const colors = useColors();
  const plotWidth = CHART_WIDTH - PLOT.left - PLOT.right;
  const step = plotWidth / Math.max(points.length, 1);
  return <>{points.map((point, index) => <SvgText key={point.month} x={PLOT.left + step * index + step / 2} y={CHART_HEIGHT - 9} textAnchor="middle" fontFamily={font('sans')} fontSize="9" fill={colors.dashboardTextMuted}>{MONTHS[point.month - 1]}</SvgText>)}</>;
}

function MonthlyTotalChart({ points }: { points: DashboardChartPoint[] }) {
  const colors = useColors();
  const max = maxFor(points.map((point) => point.total));
  const plotHeight = CHART_HEIGHT - PLOT.top - PLOT.bottom;
  const plotWidth = CHART_WIDTH - PLOT.left - PLOT.right;
  const step = plotWidth / Math.max(points.length, 1);
  const coordinates = points.map((point, index) => ({
    x: PLOT.left + step * index + step / 2,
    y: PLOT.top + plotHeight - (point.total / max) * plotHeight,
  }));
  return <ChartPanel>
    <ChartHeading title="ยอดรวมแต่ละเดือน" description="ยอดงวดทั้งหมดตามเดือนครบกำหนด" />
    <Svg width="100%" height={CHART_HEIGHT} viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}>
      <Grid max={max} />
      {coordinates.length > 0 ? <>
        <Path d={areaPath(coordinates, PLOT.top + plotHeight)} fill={colors.dashboardCoralSoft} opacity="0.8" />
        <Path d={smoothPath(coordinates)} fill="none" stroke={colors.dashboardCoral} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <Circle cx={coordinates[coordinates.length - 1].x} cy={coordinates[coordinates.length - 1].y} r="4" fill={colors.paper} stroke={colors.dashboardCoral} strokeWidth="2" />
      </> : null}
      <MonthLabels points={points} />
    </Svg>
  </ChartPanel>;
}

function MonthlyComparisonChart({ points }: { points: DashboardChartPoint[] }) {
  const colors = useColors();
  const max = maxFor(points.flatMap((point) => [point.collected, point.uncollected]));
  const plotHeight = CHART_HEIGHT - PLOT.top - PLOT.bottom;
  const plotWidth = CHART_WIDTH - PLOT.left - PLOT.right;
  const step = plotWidth / Math.max(points.length, 1);
  const xFor = (index: number) => PLOT.left + step * index + step / 2;
  const yFor = (value: number) => PLOT.top + plotHeight - (value / max) * plotHeight;
  const collectedCoordinates = points.map((point, index) => ({ x: xFor(index), y: yFor(point.collected) }));
  const uncollectedCoordinates = points.map((point, index) => ({ x: xFor(index), y: yFor(point.uncollected) }));
  return <ChartPanel>
    <View style={styles.chartHeadingRow}><ChartHeading title="เก็บได้และยังเก็บไม่ได้รายเดือน" description="เปรียบเทียบยอดเก็บแล้วกับยอดคงเหลือ" /><View style={styles.legend}><View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: colors.green }]} /><Text style={[styles.legendText, { color: colors.dashboardTextSecondary }]}>เก็บแล้ว</Text></View><View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: colors.amber }]} /><Text style={[styles.legendText, { color: colors.dashboardTextSecondary }]}>ยังไม่ได้เก็บ</Text></View></View></View>
    <Svg width="100%" height={CHART_HEIGHT} viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}>
      <Grid max={max} />
      {points.length > 0 ? <>
        <Path d={areaPath(uncollectedCoordinates, PLOT.top + plotHeight)} fill={colors.amberSoft} opacity="0.55" />
        <Path d={smoothPath(collectedCoordinates)} fill="none" stroke={colors.green} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <Path d={smoothPath(uncollectedCoordinates)} fill="none" stroke={colors.amber} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <Circle cx={collectedCoordinates[collectedCoordinates.length - 1].x} cy={collectedCoordinates[collectedCoordinates.length - 1].y} r="3.5" fill={colors.paper} stroke={colors.green} strokeWidth="2" />
        <Circle cx={uncollectedCoordinates[uncollectedCoordinates.length - 1].x} cy={uncollectedCoordinates[uncollectedCoordinates.length - 1].y} r="3.5" fill={colors.paper} stroke={colors.amber} strokeWidth="2" />
      </> : null}
      <MonthLabels points={points} />
    </Svg>
  </ChartPanel>;
}

function CollectionPieChart({ data }: { data: DashboardChartPoint }) {
  const colors = useColors();
  const total = Math.max(0, data.collected + data.uncollected);
  const collectedRatio = total > 0 ? data.collected / total : 0;
  const uncollectedRatio = total > 0 ? data.uncollected / total : 0;
  const collectedColor = colors.amber;
  const uncollectedColor = colors.dashboardText;
  const donutTrackColor = colors.dashboardCardMuted;
  const donutSize = 178;
  const center = donutSize / 2;
  const radius = 61;
  const strokeWidth = 22;
  const circumference = 2 * Math.PI * radius;
  // Round line caps extend beyond the dash length by half the stroke width on
  // both ends, so the path gap must be larger than the stroke to remain visible.
  const segmentGap = 34;
  const collectedLength = Math.max(0, circumference * collectedRatio - segmentGap);
  const uncollectedLength = Math.max(0, circumference * uncollectedRatio - segmentGap);
  return <ChartPanel>
    <ChartHeading title="สัดส่วนยอดเก็บ" description="เก็บแล้วเทียบกับยอดที่ยังเก็บไม่ครบ" />
    <View style={styles.donutStage}>
      <View style={[styles.donutMetric, { alignItems: 'flex-start' }]}>
        <Text style={[styles.donutPercent, { color: collectedColor }]}>{(collectedRatio * 100).toFixed(1)}%</Text>
        <Text style={[styles.donutMetricLabel, { color: colors.dashboardTextSecondary }]}>เก็บแล้ว</Text>
      </View>
      <Svg width={donutSize} height={donutSize} viewBox={`0 0 ${donutSize} ${donutSize}`}>
        <Circle cx={center} cy={center} r={radius} stroke={donutTrackColor} strokeWidth={strokeWidth} fill="none" />
        {total > 0 ? <>
          <Circle cx={center} cy={center} r={radius} stroke={collectedColor} strokeWidth={strokeWidth} fill="none" strokeDasharray={`${collectedLength} ${circumference - collectedLength}`} strokeDashoffset="0" strokeLinecap="round" rotation="-90" origin={`${center},${center}`} />
          <Circle cx={center} cy={center} r={radius} stroke={uncollectedColor} strokeWidth={strokeWidth} fill="none" strokeDasharray={`${uncollectedLength} ${circumference - uncollectedLength}`} strokeDashoffset={-circumference * collectedRatio} strokeLinecap="round" rotation="-90" origin={`${center},${center}`} />
        </> : null}
        <SvgText x={center} y={center - 5} textAnchor="middle" fontFamily={font('sans')} fontSize="11" fill={colors.dashboardTextMuted}>รวม</SvgText>
        <SvgText x={center} y={center + 25} textAnchor="middle" fontFamily={font('mono', 'bold')} fontSize="25" fontWeight="700" fill={colors.dashboardText}>{Math.round(total).toLocaleString('th-TH')}</SvgText>
      </Svg>
      <View style={[styles.donutMetric, { alignItems: 'flex-end' }]}>
        <Text style={[styles.donutPercent, { color: uncollectedColor }]}>{(uncollectedRatio * 100).toFixed(1)}%</Text>
        <Text style={[styles.donutMetricLabel, { color: colors.dashboardTextSecondary }]}>ยังเก็บไม่ครบ</Text>
      </View>
    </View>
    <View style={styles.donutLegend}>
      <LegendAmount color={colors.green} label="เก็บแล้ว" value={data.collected} />
      <LegendAmount color={colors.amber} label="ยังเก็บไม่ครบ" value={data.uncollected} />
    </View>
  </ChartPanel>;
}

function LegendAmount({ color, label, value }: { color: string; label: string; value: number }) {
  const colors = useColors();
  return <View style={styles.legendAmount}><View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: color }]} /><Text style={[styles.legendText, { color: colors.dashboardText }]}>{label}</Text></View><Text style={[styles.legendValue, { color: colors.dashboardText }]}>{formatBaht(value)}</Text></View>;
}

export function DashboardAnalysis({ data, isLoading, isError, isWide, controls, style }: { data?: DashboardChartData; isLoading: boolean; isError: boolean; isWide: boolean; controls?: ReactNode; style?: StyleProp<ViewStyle> }) {
  const colors = useColors();
  return <View style={[styles.analysisCard, { backgroundColor: colors.paper, borderColor: colors.dashboardBorder }, style]}>
    <View style={styles.analysisHeader}><View style={styles.analysisHeaderCopy}><Text style={[styles.analysisTitle, { color: colors.dashboardText }]}>วิเคราะห์ยอดบิล</Text><Text style={[styles.analysisDescription, { color: colors.dashboardTextSecondary }]}>ข้อมูลจากงวดที่ไม่ถูกยกเลิก แยกตามเดือนครบกำหนด</Text></View>{controls}</View>
    {isLoading ? <View style={styles.analysisState}><Text style={[styles.analysisStateText, { color: colors.dashboardTextSecondary }]}>กำลังโหลดข้อมูลกราฟ...</Text></View> : isError || !data ? <View style={styles.analysisState}><Text style={[styles.analysisStateText, { color: colors.red }]}>โหลดข้อมูลกราฟไม่สำเร็จ</Text></View> : <>
      <View style={[styles.chartRow, isWide && styles.chartRowWide]}><View style={styles.chartItem}><CollectionPieChart data={data.pie} /></View><View style={styles.chartItem}><MonthlyTotalChart points={data.monthly} /></View></View>
      <MonthlyComparisonChart points={data.monthly} />
    </>}
  </View>;
}

const styles = StyleSheet.create({
  analysisCard: { borderRadius: 22, borderWidth: 1, padding: 16, gap: 12 },
  analysisTitle: { fontFamily: font('heading', 'bold'), fontSize: 20, fontWeight: '700', letterSpacing: -0.2 },
  analysisDescription: { fontFamily: font('sans'), fontSize: 11, marginTop: 4 },
  analysisHeader: { gap: 12 },
  analysisHeaderCopy: { flex: 1, minWidth: 0 },
  analysisState: { minHeight: 170, alignItems: 'center', justifyContent: 'center' },
  analysisStateText: { fontFamily: font('sans'), fontSize: 13 },
  chartRow: { gap: 12 },
  chartRowWide: { flexDirection: 'row' },
  chartItem: { flex: 1, minWidth: 0 },
  chartPanel: { borderRadius: 17, borderWidth: 1, padding: 12, gap: 8 },
  chartHeading: { gap: 3 },
  chartHeadingRow: { gap: 8 },
  chartTitle: { fontFamily: font('sans', 'bold'), fontSize: 14, fontWeight: '700' },
  chartDescription: { fontFamily: font('sans'), fontSize: 10, lineHeight: 14 },
  chartPanelSvg: { width: '100%' },
  legend: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontFamily: font('sans'), fontSize: 10 },
  legendAmount: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  legendValue: { flexShrink: 1, fontFamily: font('mono', 'bold'), fontSize: 11, fontWeight: '700', textAlign: 'right' },
  donutStage: { minHeight: 195, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 },
  donutMetric: { width: 62, minWidth: 0, gap: 2 },
  donutPercent: { fontFamily: font('mono', 'bold'), fontSize: 13, fontWeight: '700' },
  donutMetricLabel: { maxWidth: 62, fontFamily: font('sans'), fontSize: 9, lineHeight: 13 },
  donutLegend: { gap: 8 },
});
