import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Modal, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle, useWindowDimensions } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { Banknote, CalendarDays, ChevronDown, ChevronRight, FileText, History, Landmark, MessageCircle, Receipt, Settings2, Users } from 'lucide-react-native';
import { Header, Screen } from '../../../../shared/src/ui';
import { formatBaht, formatDate, todayIso } from '../../../../shared/src/format';
import { font, useColors } from '../../../../shared/src/theme';
import type { DashboardChartData, DashboardSummary } from '../../../../shared/src/types';
import { api } from '../api';
import { useAdminAuth } from '../auth';
import type { AdminStackParamList } from '../navigation';
import { DashboardAnalysis } from '../components/DashboardCharts';

type IconComponent = typeof Users;
const CHART_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

function BentoCard({ children, muted = false, style }: { children: React.ReactNode; muted?: boolean; style?: StyleProp<ViewStyle> }) {
  const colors = useColors();
  return <View style={[dashboardStyles.bentoCard, { backgroundColor: muted ? colors.dashboardCardMuted : colors.paper, borderColor: colors.dashboardBorder }, style]}>{children}</View>;
}

function MetricCard({ label, value, tone, icon: Icon, primary = false, context, detail, style }: { label: string; value: string; tone: 'coral' | 'red' | 'green' | 'amber'; icon: IconComponent; primary?: boolean; context: string; detail: string; style?: StyleProp<ViewStyle> }) {
  const colors = useColors();
  const toneMap = {
    coral: { backgroundColor: colors.dashboardCoralSoft, color: colors.dashboardCoralText },
    red: { backgroundColor: colors.redSoft, color: colors.red },
    green: { backgroundColor: colors.greenSoft, color: colors.green },
    amber: { backgroundColor: colors.amberSoft, color: colors.amber },
  } as const;
  const current = toneMap[tone];
  const cardText = primary ? '#FFFFFF' : colors.dashboardText;
  const cardMuted = primary ? '#FFFFFFC7' : colors.dashboardTextSecondary;
  const iconBackground = primary ? '#FFFFFF2B' : colors.dashboardBorder;
  const iconColor = primary ? '#FFFFFF' : current.color;
  const contextBackground = primary ? '#FFFFFF26' : current.backgroundColor;
  const contextColor = primary ? '#FFFFFF' : current.color;
  return (
    <BentoCard style={[dashboardStyles.metricCard, { backgroundColor: primary ? colors.dashboardCoral : colors.dashboardCardMuted, borderColor: primary ? colors.dashboardCoral : colors.dashboardBorder }, style]}>
      <View style={dashboardStyles.metricTop}>
        <Text numberOfLines={2} style={[dashboardStyles.metricLabel, { color: cardText }]}>{label}</Text>
        <View style={[dashboardStyles.metricIcon, { backgroundColor: iconBackground }]}>
          <Icon size={18} color={iconColor} strokeWidth={2.1} />
        </View>
      </View>
      <Text numberOfLines={1} adjustsFontSizeToFit style={[dashboardStyles.metricValue, { color: cardText }]}>{value}</Text>
      <View style={dashboardStyles.metricContext}>
        <View style={[dashboardStyles.metricPill, { backgroundColor: contextBackground }]}><Text style={[dashboardStyles.metricPillText, { color: contextColor }]}>{context}</Text></View>
        <Text numberOfLines={1} style={[dashboardStyles.metricDetail, { color: cardMuted }]}>{detail}</Text>
      </View>
    </BentoCard>
  );
}

function ActionTile({ label, description, icon: Icon, primary = false, onPress, style }: { label: string; description: string; icon: IconComponent; primary?: boolean; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  const colors = useColors();
  const backgroundColor = primary ? colors.dashboardCoral : colors.paper;
  const textColor = primary ? '#FFFFFF' : colors.dashboardText;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [dashboardStyles.actionTile, { backgroundColor, borderColor: primary ? colors.dashboardCoral : colors.dashboardBorder, opacity: pressed ? 0.78 : 1 }, style]}>
      <View style={[dashboardStyles.actionIcon, { backgroundColor: primary ? '#FFFFFF2B' : colors.dashboardCardMuted }]}>
        <Icon size={18} color={textColor} strokeWidth={2.05} />
      </View>
      <View style={dashboardStyles.actionCopy}>
        <Text style={[dashboardStyles.actionLabel, { color: textColor }]}>{label}</Text>
        <Text style={[dashboardStyles.actionDescription, { color: primary ? '#FFFFFFC7' : colors.dashboardTextSecondary }]}>{description}</Text>
      </View>
      <ChevronRight size={18} color={primary ? '#FFFFFF' : colors.dashboardTextMuted} />
    </Pressable>
  );
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  const colors = useColors();
  return <View style={dashboardStyles.sectionHeading}><Text style={[dashboardStyles.sectionEyebrow, { color: colors.dashboardTextMuted }]}>{eyebrow}</Text><Text style={[dashboardStyles.sectionTitle, { color: colors.dashboardText }]}>{title}</Text></View>;
}

function ChartPicker({ label, value, options, onChange }: { label: string; value: string; options: Array<{ label: string; value: string }>; onChange: (value: string) => void }) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => setOpen(true)} style={({ pressed }) => [dashboardStyles.chartPicker, { backgroundColor: colors.paper, borderColor: colors.dashboardBorder, opacity: pressed ? 0.72 : 1 }]}>
      <Text numberOfLines={1} style={[dashboardStyles.chartPickerText, { color: colors.dashboardText }]}>{value}</Text><ChevronDown size={14} color={colors.dashboardTextMuted} />
    </Pressable>
    <Modal transparent animationType="slide" visible={open} onRequestClose={() => setOpen(false)}>
      <Pressable style={dashboardStyles.modalBackdrop} onPress={() => setOpen(false)}>
        <View style={[dashboardStyles.modalSheet, { backgroundColor: colors.paper, borderColor: colors.dashboardBorder }]}>
          <Text style={[dashboardStyles.modalTitle, { color: colors.dashboardText }]}>{label}</Text>
          {options.map((option) => <Pressable key={option.value} accessibilityRole="button" onPress={() => { onChange(option.value); setOpen(false); }} style={({ pressed }) => [dashboardStyles.modalOption, { borderBottomColor: colors.dashboardBorder, opacity: pressed ? 0.65 : 1 }]}><Text style={[dashboardStyles.modalOptionText, { color: option.value === value ? colors.dashboardCoralText : colors.dashboardText }]}>{option.label}</Text>{option.value === value ? <Text style={[dashboardStyles.modalCheck, { color: colors.dashboardCoralText }]}>✓</Text> : null}</Pressable>)}
        </View>
      </Pressable>
    </Modal>
  </>;
}

function DueTodaySection({ rows, loading }: { rows: any[]; loading: boolean }) {
  const colors = useColors();
  return <BentoCard style={dashboardStyles.dueCard}>
    <View style={dashboardStyles.dueHeading}><View><Text style={[dashboardStyles.dueTitle, { color: colors.dashboardText }]}>ครบกำหนดวันนี้</Text><Text style={[dashboardStyles.dueDescription, { color: colors.dashboardTextSecondary }]}>รายการงวดที่ต้องติดตามในวันนี้</Text></View><View style={[dashboardStyles.dueCount, { backgroundColor: colors.dashboardCoralSoft }]}><Text style={[dashboardStyles.dueCountText, { color: colors.dashboardCoralText }]}>{rows.length}</Text></View></View>
    {loading ? <Text style={[dashboardStyles.dueEmpty, { color: colors.dashboardTextSecondary }]}>กำลังโหลดรายการ...</Text> : rows.length === 0 ? <Text style={[dashboardStyles.dueEmpty, { color: colors.dashboardTextSecondary }]}>ยังไม่มีรายการครบกำหนดวันนี้</Text> : rows.slice(0, 5).map((row) => {
      const customer = row.bill_plan?.customer?.display_name || row.bill_plan?.customer?.customer_code || 'ลูกค้า';
      return <View key={row.id} style={[dashboardStyles.dueRow, { borderBottomColor: colors.dashboardBorder }]}><View style={[dashboardStyles.dueIcon, { backgroundColor: colors.amberSoft }]}><CalendarDays size={16} color={colors.amber} /></View><View style={dashboardStyles.dueCopy}><Text numberOfLines={1} style={[dashboardStyles.dueCustomer, { color: colors.dashboardText }]}>{customer}</Text><Text numberOfLines={1} style={[dashboardStyles.dueMeta, { color: colors.dashboardTextSecondary }]}>บิล #{row.bill_plan?.bill_no ?? '—'} · งวดที่ {row.installment_no ?? '—'} · {formatDate(row.due_date)}</Text></View><Text numberOfLines={1} style={[dashboardStyles.dueAmount, { color: colors.dashboardText }]}>{formatBaht(row.amount_due)}</Text></View>;
    })}
    {rows.length > 5 ? <Text style={[dashboardStyles.dueMore, { color: colors.dashboardTextSecondary }]}>แสดง 5 รายการแรกจากทั้งหมด {rows.length} รายการ</Text> : null}
  </BentoCard>;
}

function SystemItem({ title, description, icon: Icon, onPress, last = false }: { title: string; description: string; icon: IconComponent; onPress: () => void; last?: boolean }) {
  const colors = useColors();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [dashboardStyles.systemItem, !last && { borderBottomColor: colors.dashboardBorder, borderBottomWidth: StyleSheet.hairlineWidth }, { opacity: pressed ? 0.68 : 1 }]}>
      <View style={[dashboardStyles.systemIcon, { backgroundColor: colors.dashboardCardMuted }]}><Icon size={17} color={colors.dashboardText} strokeWidth={2} /></View>
      <View style={dashboardStyles.systemCopy}><Text style={[dashboardStyles.systemTitle, { color: colors.dashboardText }]}>{title}</Text><Text style={[dashboardStyles.systemDescription, { color: colors.dashboardTextSecondary }]}>{description}</Text></View>
      <ChevronRight size={17} color={colors.dashboardTextMuted} />
    </Pressable>
  );
}

export function DashboardScreen() {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const isWide = width >= 800;
  const navigation = useNavigation<NativeStackNavigationProp<AdminStackParamList>>();
  const { orgName } = useAdminAuth();
  const currentIso = todayIso();
  const [todayYear, todayMonth] = currentIso.split('-').map(Number);
  const [chartPeriod, setChartPeriod] = useState<'month' | 'year'>('month');
  const [chartYear, setChartYear] = useState(todayYear);
  const [chartMonth, setChartMonth] = useState(todayMonth);
  const summary = useQuery({ queryKey: ['mobile-summary', orgName, currentIso], queryFn: () => api.get<DashboardSummary>(`/api/reports/summary?from=${currentIso}&to=${currentIso}`) });
  const charts = useQuery({
    queryKey: ['mobile-dashboard-charts', orgName, chartPeriod, chartYear, chartMonth],
    queryFn: () => api.get<DashboardChartData>(`/api/reports/dashboard-charts?period=${chartPeriod}&year=${chartYear}&month=${chartMonth}`),
  });
  const due = useQuery({ queryKey: ['mobile-due'], queryFn: () => api.get<any[]>('/api/installments/due-today') });
  const overdue = useQuery({ queryKey: ['mobile-overdue'], queryFn: () => api.get<any[]>('/api/installments/overdue') });
  const pending = useQuery({ queryKey: ['mobile-pending'], queryFn: () => api.get<{ items: any[]; total: number }>('/api/admin/payment-submissions?review_status=pending_review&limit=1') });
  const today = new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
  const dayNumber = new Date().toLocaleDateString('th-TH', { day: 'numeric' });

  return (
    <Screen
      backgroundColor={colors.dashboardPage}
      stickyHeader={<View style={[dashboardStyles.dashboardHeader, { backgroundColor: colors.dashboardSurface, borderBottomColor: colors.dashboardBorder }, isWide && dashboardStyles.dashboardHeaderWide]}><Header eyebrow={orgName ?? 'BILL ADMIN'} title="ภาพรวม" /></View>}
      style={[dashboardStyles.screen, isWide && dashboardStyles.screenWide]}
    >
      <View style={[dashboardStyles.appSurface, { backgroundColor: colors.dashboardSurface, borderColor: colors.dashboardBorder }, isWide && dashboardStyles.appSurfaceWide]}>
        <View style={[dashboardStyles.heroCard, { backgroundColor: colors.paper, borderColor: colors.dashboardBorder }]}>
          <View style={[dashboardStyles.hero, isWide && dashboardStyles.heroWide]}>
            <View style={[dashboardStyles.dayCircle, { borderColor: colors.dashboardBorder }]}><Text style={[dashboardStyles.dayNumber, { color: colors.dashboardText }]}>{dayNumber}</Text></View>
            <View style={dashboardStyles.heroCopy}><Text style={[dashboardStyles.heroEyebrow, { color: colors.dashboardTextMuted }]}>ประจำวันที่</Text><Text style={[dashboardStyles.heroDate, { color: colors.dashboardText }]}>{today}</Text></View>
            <View style={[dashboardStyles.todayPill, { backgroundColor: colors.dashboardCoralSoft }]}><CalendarDays size={15} color={colors.dashboardCoralText} /><Text style={[dashboardStyles.todayText, { color: colors.dashboardCoralText }]}>วันนี้</Text></View>
          </View>
        </View>

        <View style={[dashboardStyles.overviewCard, { backgroundColor: colors.paper, borderColor: colors.dashboardBorder }]}> 
          <SectionHeading eyebrow="OVERVIEW" title="ภาพรวมการเรียกเก็บ" />
          <View style={dashboardStyles.metricsGrid}>
            <View style={dashboardStyles.metricGridItem}><MetricCard primary label="ยอดเก็บวันนี้" value={formatBaht(summary.data?.collected ?? 0)} tone="green" icon={Banknote} context="วันนี้" detail="ยอดเก็บจริง" /></View>
            <View style={dashboardStyles.metricGridItem}><MetricCard label="ยอดรวมบิลทั้งหมด" value={formatBaht(summary.data?.total_bill_amount ?? 0)} tone="coral" icon={FileText} context="ทั้งระบบ" detail="ยอดตามบิล" /></View>
            <View style={dashboardStyles.metricGridItem}><MetricCard label="ครบกำหนดวันนี้" value={String(due.data?.length ?? 0)} tone="amber" icon={CalendarDays} context="วันนี้" detail="รายการครบกำหนด" /></View>
            <View style={dashboardStyles.metricGridItem}><MetricCard label="สลิปรอตรวจ" value={String(pending.data?.total ?? 0)} tone="red" icon={Receipt} context="รอตรวจ" detail="รายการรอดำเนินการ" /></View>
          </View>
        </View>

        <DueTodaySection rows={due.data ?? []} loading={due.isLoading} />

        <DashboardAnalysis
          data={charts.data}
          isLoading={charts.isLoading}
          isError={charts.isError}
          isWide={isWide}
          controls={<View style={dashboardStyles.chartControls}>
            <View style={[dashboardStyles.periodToggle, { borderColor: colors.dashboardBorder, backgroundColor: colors.dashboardCardMuted }]}>
              {(['month', 'year'] as const).map((period) => <Pressable key={period} accessibilityRole="button" onPress={() => setChartPeriod(period)} style={[dashboardStyles.periodOption, chartPeriod === period && { backgroundColor: colors.dashboardCoral }]}><Text style={[dashboardStyles.periodOptionText, { color: chartPeriod === period ? '#FFFFFF' : colors.dashboardTextSecondary }]}>{period === 'month' ? 'รายเดือน' : 'รายปี'}</Text></Pressable>)}
            </View>
            <ChartPicker label="เลือกปี" value={String(chartYear + 543)} options={Array.from({ length: 5 }, (_, index) => { const year = todayYear - index; return { value: String(year), label: String(year + 543) }; })} onChange={(value) => setChartYear(Number(value))} />
            {chartPeriod === 'month' ? <ChartPicker label="เลือกเดือน" value={CHART_MONTHS[chartMonth - 1]} options={CHART_MONTHS.map((label, index) => ({ label, value: String(index + 1) }))} onChange={(value) => setChartMonth(Number(value))} /> : null}
          </View>}
        />

        <SectionHeading eyebrow="QUICK ACTIONS" title="จัดการงานวันนี้" />
        <BentoCard style={[dashboardStyles.actionsCard, { borderColor: colors.dashboardCoral }]}>
          <View style={[dashboardStyles.actionLayout, isWide && dashboardStyles.actionLayoutWide]}>
            <ActionTile style={isWide ? dashboardStyles.actionLeadWide : dashboardStyles.actionLead} label="ลูกค้า" description="จัดการข้อมูลลูกค้า" icon={Users} primary onPress={() => navigation.navigate('Customers')} />
            <View style={[dashboardStyles.actionPair, isWide && dashboardStyles.actionPairWide]}>
              <ActionTile style={dashboardStyles.actionPairItem} label="สร้างบิล" description="สร้างแผนการชำระ" icon={FileText} onPress={() => navigation.navigate('Bills')} />
              <ActionTile style={dashboardStyles.actionPairItem} label={`ตรวจสลิป (${pending.data?.total ?? 0})`} description="ตรวจสอบและอนุมัติ" icon={Receipt} onPress={() => navigation.navigate('Submissions')} />
            </View>
            <ActionTile style={isWide ? dashboardStyles.actionSideWide : dashboardStyles.actionSide} label="บัญชีรับโอน" description="จัดการบัญชีธนาคาร" icon={Landmark} onPress={() => navigation.navigate('Banks')} />
          </View>
        </BentoCard>

        <SectionHeading eyebrow="TODAY" title="สถานะวันนี้" />
        <BentoCard muted style={dashboardStyles.statusCard}>
          <View style={dashboardStyles.statusTop}><View style={[dashboardStyles.statusDot, { backgroundColor: colors.dashboardCoral }]} /><Text style={[dashboardStyles.statusTitle, { color: colors.dashboardText }]}>ค้างชำระเกินกำหนด</Text></View>
          <View style={dashboardStyles.statusStats}><View><Text style={[dashboardStyles.statusValue, { color: colors.dashboardCoralText }]}>{overdue.data?.length ?? 0} งวด</Text><Text style={[dashboardStyles.statusLabel, { color: colors.dashboardTextSecondary }]}>รายการค้างชำระ</Text></View><View><Text style={[dashboardStyles.statusValue, { color: colors.dashboardText }]}>{formatBaht(summary.data?.overdue_amount ?? 0)}</Text><Text style={[dashboardStyles.statusLabel, { color: colors.dashboardTextSecondary }]}>ยอดค้างชำระ</Text></View><View><Text style={[dashboardStyles.statusValue, { color: colors.dashboardText }]}>{summary.data?.customers ?? 0}</Text><Text style={[dashboardStyles.statusLabel, { color: colors.dashboardTextSecondary }]}>ลูกค้าในองค์กร</Text></View></View>
        </BentoCard>

        <SectionHeading eyebrow="SYSTEM" title="เมนูระบบ" />
        <BentoCard style={dashboardStyles.systemCard}>
          <SystemItem title="รายงาน" description="ภาพรวมรายวันและกราฟ" icon={FileText} onPress={() => navigation.navigate('ComingSoon', { title: 'รายงาน', description: 'ภาพรวมรายวันและกราฟ' })} />
          <SystemItem title="LINE OA" description="บัญชีและ webhook" icon={MessageCircle} onPress={() => navigation.navigate('ComingSoon', { title: 'LINE OA', description: 'บัญชีและ webhook' })} />
          <SystemItem title="ตั้งค่า" description="ข้อความตอบกลับและระบบ" icon={Settings2} onPress={() => navigation.navigate('ComingSoon', { title: 'ตั้งค่า', description: 'ข้อความตอบกลับและระบบ' })} />
          <SystemItem title="ประวัติ" description="ตรวจสอบ audit logs" icon={History} last onPress={() => navigation.navigate('ComingSoon', { title: 'ประวัติ', description: 'ตรวจสอบ audit logs' })} />
        </BentoCard>
      </View>
    </Screen>
  );
}

const dashboardStyles = StyleSheet.create({
  screen: { padding: 0, gap: 0 },
  screenWide: { padding: 20 },
  dashboardHeader: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 10 },
  dashboardHeaderWide: { paddingHorizontal: 44, paddingTop: 18, paddingBottom: 18 },
  appSurface: { flex: 1, padding: 20, gap: 16 },
  appSurfaceWide: { borderRadius: 32, borderWidth: 1, padding: 24 },
  heroCard: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  heroWide: { paddingVertical: 8 },
  dayCircle: { width: 64, height: 64, borderRadius: 32, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dayNumber: { fontFamily: font('sans', 'medium'), fontSize: 25, fontWeight: '500' },
  heroCopy: { flex: 1, minWidth: 0 },
  heroEyebrow: { fontFamily: font('mono'), fontSize: 10, letterSpacing: 1.1 },
  heroDate: { fontFamily: font('sans', 'semibold'), fontSize: 15, fontWeight: '600', marginTop: 4 },
  todayPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9 },
  todayText: { fontFamily: font('sans', 'bold'), fontSize: 12, fontWeight: '700' },
  overviewCard: { borderRadius: 22, borderWidth: 1, padding: 16, gap: 12 },
  sectionHeading: { gap: 2, marginTop: 6 },
  sectionEyebrow: { fontFamily: font('latin', 'bold'), fontSize: 9, fontWeight: '700', letterSpacing: 1.6 },
  sectionTitle: { fontFamily: font('heading', 'bold'), fontSize: 20, fontWeight: '700', letterSpacing: -0.25 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metricGridItem: { width: '48%', minWidth: 0 },
  bentoCard: { borderRadius: 22, borderWidth: 1, padding: 16, gap: 10, shadowColor: '#111111', shadowOpacity: 0.035, shadowRadius: 9, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  metricCard: { minHeight: 146, justifyContent: 'space-between' },
  metricTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  metricIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  metricLabel: { flex: 1, fontFamily: font('sans', 'semibold'), fontSize: 14, fontWeight: '600', lineHeight: 19 },
  metricValue: { fontFamily: font('mono', 'bold'), fontSize: 26, fontWeight: '700', letterSpacing: -1 },
  metricContext: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  metricPill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  metricPillText: { fontFamily: font('sans', 'bold'), fontSize: 10, fontWeight: '700' },
  metricDetail: { flex: 1, fontFamily: font('sans'), fontSize: 10 },
  chartControls: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  periodToggle: { flexDirection: 'row', borderRadius: 10, borderWidth: 1, padding: 3, gap: 2 },
  periodOption: { minHeight: 32, borderRadius: 8, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  periodOptionText: { fontFamily: font('sans', 'bold'), fontSize: 11, fontWeight: '700' },
  chartPicker: { minHeight: 40, maxWidth: 138, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderRadius: 10, borderWidth: 1, paddingHorizontal: 11 },
  chartPickerText: { flexShrink: 1, fontFamily: font('sans', 'semibold'), fontSize: 11, fontWeight: '600' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000055' },
  modalSheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 30 },
  modalTitle: { fontFamily: font('heading', 'bold'), fontSize: 18, fontWeight: '700', marginBottom: 8 },
  modalOption: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth },
  modalOptionText: { fontFamily: font('sans', 'semibold'), fontSize: 15, fontWeight: '600' },
  modalCheck: { fontFamily: font('sans', 'bold'), fontSize: 18, fontWeight: '700' },
  dueCard: { gap: 0, paddingVertical: 8 },
  dueHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 8, paddingVertical: 8 },
  dueTitle: { fontFamily: font('heading', 'bold'), fontSize: 17, fontWeight: '700' },
  dueDescription: { fontFamily: font('sans'), fontSize: 11, marginTop: 3 },
  dueCount: { minWidth: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  dueCountText: { fontFamily: font('mono', 'bold'), fontSize: 12, fontWeight: '700' },
  dueRow: { minHeight: 65, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth },
  dueIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  dueCopy: { flex: 1, minWidth: 0, gap: 3 },
  dueCustomer: { fontFamily: font('sans', 'bold'), fontSize: 13, fontWeight: '700' },
  dueMeta: { fontFamily: font('sans'), fontSize: 10 },
  dueAmount: { maxWidth: 100, fontFamily: font('mono', 'bold'), fontSize: 11, fontWeight: '700', textAlign: 'right' },
  dueEmpty: { minHeight: 92, paddingHorizontal: 8, paddingVertical: 32, textAlign: 'center', fontFamily: font('sans'), fontSize: 12 },
  dueMore: { paddingHorizontal: 8, paddingTop: 10, fontFamily: font('sans'), fontSize: 10 },
  actionsCard: { borderWidth: 1.4 },
  actionLayout: { gap: 10 },
  actionLayoutWide: { flexDirection: 'row', alignItems: 'stretch' },
  actionLead: { minHeight: 76 },
  actionLeadWide: { flex: 1.25, minHeight: 142 },
  actionPair: { flexDirection: 'row', gap: 10 },
  actionPairWide: { flex: 1, flexDirection: 'column' },
  actionPairItem: { flex: 1, minWidth: 0 },
  actionSide: { minHeight: 68 },
  actionSideWide: { flex: 1, minHeight: 142 },
  actionTile: { minHeight: 60, borderRadius: 17, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  actionIcon: { width: 35, height: 35, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  actionCopy: { flex: 1, minWidth: 0, gap: 2 },
  actionLabel: { fontFamily: font('sans', 'bold'), fontSize: 14, fontWeight: '700' },
  actionDescription: { fontFamily: font('sans'), fontSize: 11 },
  statusCard: { minHeight: 126 },
  statusTop: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  statusDot: { width: 9, height: 9, borderRadius: 5 },
  statusTitle: { fontFamily: font('sans', 'bold'), fontSize: 16, fontWeight: '700' },
  statusStats: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginTop: 5 },
  statusValue: { fontFamily: font('mono', 'bold'), fontSize: 16, fontWeight: '700' },
  statusLabel: { fontFamily: font('sans'), fontSize: 10, marginTop: 4 },
  systemCard: { paddingVertical: 4, gap: 0 },
  systemItem: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 8 },
  systemIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  systemCopy: { flex: 1, minWidth: 0, gap: 2 },
  systemTitle: { fontFamily: font('sans', 'bold'), fontSize: 14, fontWeight: '700' },
  systemDescription: { fontFamily: font('sans'), fontSize: 11 },
});
