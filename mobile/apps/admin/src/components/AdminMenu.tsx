import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NavigationContainerRef } from '@react-navigation/native';
import {
  BarChart3,
  Bell,
  CalendarDays,
  Building2,
  ChevronRight,
  FileText,
  HardDrive,
  History,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu as MenuGlyph,
  MessageSquare,
  Receipt,
  CircleAlert,
  Settings,
  UserCheck,
  Users,
} from 'lucide-react-native';
import { HeaderMenuProvider } from '../../../../shared/src/ui';
import { font, useColors } from '../../../../shared/src/theme';
import type { AdminStackParamList } from '../navigation';
import { api } from '../api';
import { GlassView } from './GlassView';

type AdminNavigation = NavigationContainerRef<AdminStackParamList>;
type MenuIcon = typeof LayoutDashboard;
type MenuItem = {
  id: string;
  label: string;
  description?: string;
  icon: MenuIcon;
  route: keyof AdminStackParamList;
  params?: { title: string; description: string };
};

type NotificationItem = {
  id: string;
  label: string;
  count: number;
  tone: 'danger' | 'warn' | 'info';
  icon: MenuIcon;
  route: keyof AdminStackParamList;
};

type IslandItem = {
  id: string;
  label: string;
  icon: MenuIcon;
  route: keyof AdminStackParamList;
};

const orgSections: Array<{ label: string; items: MenuItem[] }> = [
  {
    label: 'ภาพรวม',
    items: [{ id: 'dashboard', label: 'ภาพรวม', icon: LayoutDashboard, route: 'Dashboard' }],
  },
  {
    label: 'จัดการ',
    items: [
      { id: 'customers', label: 'ลูกค้า', icon: Users, route: 'Customers' },
      { id: 'bills', label: 'สร้างบิล', icon: FileText, route: 'Bills' },
      { id: 'banks', label: 'บัญชีรับโอน', icon: Landmark, route: 'Banks' },
      { id: 'submissions', label: 'สลิป / อนุมัติ', icon: Receipt, route: 'Submissions' },
    ],
  },
  {
    label: 'รายงาน & ระบบ',
    items: [
      { id: 'reports', label: 'รายงาน', description: 'ภาพรวมรายวันและกราฟ', icon: BarChart3, route: 'Reports' },
      { id: 'line-oa', label: 'LINE OA', description: 'บัญชีและ webhook', icon: MessageSquare, route: 'LineOa' },
      { id: 'chat', label: 'Chatclone', description: 'ดูประวัติการสนทนา LINE', icon: MessageSquare, route: 'ChatClone' },
      { id: 'senders', label: 'ผู้ส่งสลิป', icon: UserCheck, route: 'Senders' },
      { id: 'groups', label: 'กลุ่ม LINE', icon: Users, route: 'Groups' },
      { id: 'settings', label: 'ตั้งค่า', icon: Settings, route: 'Settings' },
      { id: 'messages', label: 'ข้อความตอบกลับ LINE', icon: MessageSquare, route: 'MessageSettings' },
      { id: 'logs', label: 'ประวัติ', icon: History, route: 'Logs' },
    ],
  },
];

const platformSections: Array<{ label: string; items: MenuItem[] }> = [
  {
    label: 'แพลตฟอร์ม',
    items: [{ id: 'organizations', label: 'ผู้ใช้ & องค์กร', icon: Building2, route: 'Platform' }],
  },
  {
    label: 'ตั้งค่า',
    items: [
      { id: 'platform-settings', label: 'ตั้งค่าระบบ', icon: Settings, route: 'ComingSoon', params: { title: 'ตั้งค่าระบบ', description: 'หน้าตั้งค่าระบบ native กำลังเตรียมข้อมูลให้ครบตามเว็บ' } },
      { id: 'storage', label: 'File Storage', icon: HardDrive, route: 'ComingSoon', params: { title: 'File Storage', description: 'หน้าจัดการ storage native กำลังเตรียมข้อมูลให้ครบตามเว็บ' } },
    ],
  },
];

const orgIslandItems: IslandItem[] = [
  { id: 'dashboard', label: 'ภาพรวม', icon: LayoutDashboard, route: 'Dashboard' },
  { id: 'chat', label: 'แชท', icon: MessageSquare, route: 'ChatClone' },
  { id: 'customers', label: 'ลูกค้า', icon: Users, route: 'Customers' },
  { id: 'submissions', label: 'สลิป', icon: Receipt, route: 'Submissions' },
];

const platformIslandItems: IslandItem[] = [
  { id: 'platform', label: 'องค์กร', icon: Building2, route: 'Platform' },
];

function initials(value?: string | null) {
  const text = value?.trim() || 'U';
  return text.slice(0, 2).toUpperCase();
}

export function AdminMenuProvider({ children, mode, profileLabel, onLogout, navigationRef }: PropsWithChildren<{ mode: 'org' | 'platform'; profileLabel?: string | null; onLogout: () => void; navigationRef: AdminNavigation }>) {
  const colors = useColors();
  const isDark = useColorScheme() === 'dark';
  const [open, setOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [activeRoute, setActiveRoute] = useState<keyof AdminStackParamList | undefined>();
  const sections = mode === 'platform' ? platformSections : orgSections;
  const islandItems = mode === 'platform' ? platformIslandItems : orgIslandItems;
  const islandActiveRoute = islandItems.find((item) => activeRoute === item.route || (item.route === 'Customers' && activeRoute === 'CustomerDetail'))?.route ?? islandItems[0]?.route;
  const profileInitials = useMemo(() => initials(profileLabel), [profileLabel]);
  const notificationsEnabled = mode === 'org';
  const pending = useQuery({ queryKey: ['mobile-pending'], queryFn: () => api.get<{ total: number }>('/api/admin/payment-submissions?review_status=pending_review&limit=1'), enabled: notificationsEnabled, refetchInterval: 30_000 });
  const due = useQuery({ queryKey: ['mobile-due'], queryFn: () => api.get<any[]>('/api/installments/due-today'), enabled: notificationsEnabled, refetchInterval: 60_000 });
  const overdue = useQuery({ queryKey: ['mobile-overdue'], queryFn: () => api.get<any[]>('/api/installments/overdue'), enabled: notificationsEnabled, refetchInterval: 60_000 });
  const notificationItems: NotificationItem[] = [
    { id: 'subs', label: 'สลิปรอตรวจสอบ', count: pending.data?.total ?? 0, tone: 'warn', icon: Receipt, route: 'Submissions' },
    { id: 'due', label: 'ครบกำหนดวันนี้', count: due.data?.length ?? 0, tone: 'info', icon: CalendarDays, route: 'Dashboard' },
    { id: 'overdue', label: 'ค้างชำระ', count: overdue.data?.length ?? 0, tone: 'danger', icon: CircleAlert, route: 'Dashboard' },
  ];
  const notificationCount = notificationItems.reduce((total, item) => total + item.count, 0);
  const notificationButton = notificationsEnabled ? <Pressable accessibilityLabel="การแจ้งเตือน" accessibilityRole="button" onPress={() => setNotificationsOpen(true)} style={({ pressed }) => [styles.notificationButton, { opacity: pressed ? 0.7 : 1 }]}>
    <Bell size={21} color={colors.ink} strokeWidth={2} />
    {notificationCount > 0 ? <View style={styles.notificationBadge}><Text style={styles.notificationBadgeText}>{notificationCount > 99 ? '99+' : notificationCount}</Text></View> : null}
  </Pressable> : null;

  const go = (item: MenuItem) => {
    setOpen(false);
    if (!navigationRef.isReady()) return;
    if (item.route === 'ComingSoon') {
      navigationRef.navigate('ComingSoon', item.params as { title: string; description: string });
      return;
    }
    navigationRef.navigate(item.route as never);
  };

  const goToRoute = (route: keyof AdminStackParamList) => {
    if (navigationRef.isReady()) navigationRef.navigate(route as never);
  };

  const goToNotification = (item: NotificationItem) => {
    setNotificationsOpen(false);
    if (navigationRef.isReady()) navigationRef.navigate(item.route as never);
  };

  useEffect(() => {
    const readRoute = () => setActiveRoute(navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name as keyof AdminStackParamList | undefined : undefined);
    readRoute();
    const unsubscribe = navigationRef.addListener?.('state', readRoute);
    return typeof unsubscribe === 'function' ? unsubscribe : undefined;
  }, [navigationRef]);

  return (
    <HeaderMenuProvider value={{ onOpenMenu: () => setOpen(true), notification: notificationButton, profileLabel, profileInitials }}>
      {children}
      <Modal animationType="slide" transparent visible={open} onRequestClose={() => setOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable accessibilityLabel="ปิดเมนู" style={styles.backdrop} onPress={() => setOpen(false)} />
          <SafeAreaView edges={['bottom']} style={[styles.sheet, { backgroundColor: colors.paper }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View>
                <Text style={[styles.sheetEyebrow, { color: colors.muted }]}>BILL ADMIN</Text>
                <Text style={[styles.sheetTitle, { color: colors.ink }]}>{profileLabel || (mode === 'platform' ? 'Super Admin' : 'สมุดลูกหนี้')}</Text>
              </View>
              <Pressable accessibilityLabel="ปิดเมนู" accessibilityRole="button" onPress={() => setOpen(false)} style={[styles.closeButton, { borderColor: colors.line }]}>
                <Text style={[styles.closeText, { color: colors.ink }]}>×</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.menuScroll}>
              {sections.map((section) => (
                <View key={section.label} style={styles.section}>
                  <Text style={[styles.sectionLabel, { color: colors.muted }]}>{section.label}</Text>
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const active = activeRoute === item.route && item.route !== 'ComingSoon';
                    return (
                      <Pressable key={item.id} accessibilityRole="button" onPress={() => go(item)} style={({ pressed }) => [styles.menuItem, { backgroundColor: active ? colors.coralSoft : 'transparent', opacity: pressed ? 0.7 : 1 }]}>
                        <View style={[styles.iconCircle, { backgroundColor: active ? colors.coral : colors.cream }]}><Icon size={17} color={active ? '#FFFFFF' : colors.ink} strokeWidth={2} /></View>
                        <View style={styles.itemText}>
                          <Text style={[styles.itemLabel, { color: colors.ink, fontWeight: active ? '700' : '600' }]}>{item.label}</Text>
                          {item.description ? <Text style={[styles.itemDescription, { color: colors.muted }]}>{item.description}</Text> : null}
                        </View>
                        <ChevronRight size={17} color={colors.muted} />
                      </Pressable>
                    );
                  })}
                </View>
              ))}
              <Pressable accessibilityRole="button" onPress={() => { setOpen(false); onLogout(); }} style={({ pressed }) => [styles.logoutItem, { borderColor: colors.line, opacity: pressed ? 0.7 : 1 }]}>
                <LogOut size={17} color={colors.coralText} />
                <Text style={[styles.logoutText, { color: colors.coralText }]}>ออกจากระบบ</Text>
              </Pressable>
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
      <Modal animationType="slide" transparent visible={notificationsOpen} onRequestClose={() => setNotificationsOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable accessibilityLabel="ปิดการแจ้งเตือน" style={styles.backdrop} onPress={() => setNotificationsOpen(false)} />
          <SafeAreaView edges={['bottom']} style={[styles.notificationSheet, { backgroundColor: colors.paper }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View>
                <Text style={[styles.sheetEyebrow, { color: colors.muted }]}>BILL ADMIN</Text>
                <Text style={[styles.sheetTitle, { color: colors.ink }]}>การแจ้งเตือน</Text>
              </View>
              <Pressable accessibilityLabel="ปิดการแจ้งเตือน" accessibilityRole="button" onPress={() => setNotificationsOpen(false)} style={[styles.closeButton, { borderColor: colors.line }]}>
                <Text style={[styles.closeText, { color: colors.ink }]}>×</Text>
              </Pressable>
            </View>
            {notificationItems.filter((item) => item.count > 0).length === 0 ? <Text style={[styles.notificationEmpty, { color: colors.muted }]}>ไม่มีรายการต้องดำเนินการ</Text> : <ScrollView contentContainerStyle={styles.notificationList}>
              {notificationItems.filter((item) => item.count > 0).map((item) => {
                const Icon = item.icon;
                const tone = item.tone === 'danger' ? { backgroundColor: colors.redSoft, color: colors.red } : item.tone === 'warn' ? { backgroundColor: colors.amberSoft, color: colors.amber } : { backgroundColor: colors.greenSoft, color: colors.green };
                return <Pressable key={item.id} accessibilityRole="button" onPress={() => goToNotification(item)} style={({ pressed }) => [styles.notificationItem, { borderColor: colors.line, backgroundColor: colors.paper, opacity: pressed ? 0.7 : 1 }]}>
                  <View style={[styles.notificationIcon, { backgroundColor: tone.backgroundColor }]}><Icon size={18} color={tone.color} strokeWidth={2} /></View>
                  <Text style={[styles.notificationLabel, { color: colors.ink }]}>{item.label}</Text>
                  <Text style={[styles.notificationCount, { color: tone.color }]}>{item.count}</Text>
                  <ChevronRight size={17} color={colors.muted} />
                </Pressable>;
              })}
            </ScrollView>}
          </SafeAreaView>
        </View>
      </Modal>
      <View pointerEvents="box-none" style={styles.islandDock}>
        <View style={styles.islandShadow}>
          <View accessibilityLabel="เมนู island" style={[styles.menuIsland, { borderColor: isDark ? 'rgba(255,255,255,0.34)' : 'rgba(255,255,255,0.82)' }]}>
            <GlassView
              intensity={0.82}
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(15,23,42,0.20)' : 'rgba(255,255,255,0.26)' }]}
            />
            <View style={styles.menuIslandContent}>
              {islandItems.map((item) => {
                const Icon = item.icon;
                const badgeCount = item.route === 'Submissions' ? pending.data?.total ?? 0 : 0;
                const islandActive = islandActiveRoute === item.route;
                return <Pressable key={item.id} accessibilityLabel={`เมนู island: ${item.label}`} accessibilityRole="button" onPress={() => goToRoute(item.route)} style={({ pressed }) => [styles.islandItem, islandActive && styles.islandItemActive, { backgroundColor: islandActive ? isDark ? 'rgba(255,255,255,0.24)' : 'rgba(255,255,255,0.36)' : 'transparent', opacity: pressed ? 0.72 : 1 }]}>
                  <Icon size={23} color={islandActive ? colors.ink : colors.dashboardText} strokeWidth={2.15} />
                  {islandActive ? <Text style={[styles.islandLabel, { color: colors.ink }]}>{item.label}</Text> : null}
                  {badgeCount > 0 ? <View style={[styles.islandBadge, { backgroundColor: colors.red, borderColor: isDark ? '#0F172ACC' : '#FFFFFFFF' }]}><Text style={styles.islandBadgeText}>{badgeCount > 99 ? '99+' : badgeCount}</Text></View> : null}
                </Pressable>;
              })}
              <Pressable accessibilityLabel="เมนู island: เมนูทั้งหมด" accessibilityRole="button" onPress={() => setOpen(true)} style={({ pressed }) => [styles.islandItem, { opacity: pressed ? 0.72 : 1 }]}>
                <MenuGlyph size={23} color={colors.dashboardText} strokeWidth={2.15} />
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </HeaderMenuProvider>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: '#0F172A99' },
  sheet: { maxHeight: '88%', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 10 },
  notificationSheet: { maxHeight: '60%', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 10 },
  sheetHandle: { alignSelf: 'center', width: 42, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1', marginBottom: 14 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingBottom: 12 },
  sheetEyebrow: { fontFamily: font('latin', 'bold'), fontSize: 10, letterSpacing: 1.5 },
  sheetTitle: { fontFamily: font('heading', 'bold'), fontSize: 21, fontWeight: '700', marginTop: 3 },
  closeButton: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontFamily: font('sans'), fontSize: 25, lineHeight: 28, fontWeight: '300' },
  notificationButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  notificationBadge: { position: 'absolute', top: -1, right: -1, minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EF4444', borderWidth: 1.5, borderColor: '#FFFFFF' },
  notificationBadgeText: { color: '#FFFFFF', fontFamily: font('mono', 'bold'), fontSize: 9, lineHeight: 11, fontWeight: '700' },
  menuScroll: { paddingBottom: 28, gap: 18 },
  section: { gap: 5 },
  sectionLabel: { fontFamily: font('sans', 'bold'), fontSize: 10, letterSpacing: 1.3, textTransform: 'uppercase', paddingHorizontal: 4, paddingBottom: 3 },
  menuItem: { minHeight: 52, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 10 },
  iconCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  itemText: { flex: 1, minWidth: 0 },
  itemLabel: { fontFamily: font('sans'), fontSize: 14 },
  itemDescription: { fontFamily: font('sans'), fontSize: 11, marginTop: 1 },
  logoutItem: { minHeight: 48, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 2 },
  logoutText: { fontFamily: font('sans', 'semibold'), fontSize: 14, fontWeight: '600' },
  notificationEmpty: { minHeight: 120, textAlign: 'center', paddingTop: 40, fontFamily: font('sans'), fontSize: 14 },
  notificationList: { gap: 10, paddingBottom: 26 },
  notificationItem: { minHeight: 58, borderRadius: 16, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12 },
  notificationIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  notificationLabel: { flex: 1, fontFamily: font('sans', 'semibold'), fontSize: 14, fontWeight: '600' },
  notificationCount: { fontFamily: font('mono', 'bold'), fontSize: 14, fontWeight: '700' },
  islandDock: { position: 'absolute', left: 0, right: 0, bottom: 18, alignItems: 'center', paddingHorizontal: 10, zIndex: 30 },
  islandShadow: { maxWidth: '100%', borderRadius: 999, shadowColor: '#0F172A', shadowOpacity: 0.26, shadowRadius: 18, shadowOffset: { width: 0, height: 7 }, elevation: 9 },
  menuIsland: { maxWidth: '100%', borderRadius: 999, borderWidth: 1.5, overflow: 'hidden' },
  menuIslandContent: { flexDirection: 'row', alignItems: 'center', gap: 3, padding: 8 },
  islandItem: { minWidth: 47, height: 56, borderRadius: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 11, position: 'relative' },
  islandItemActive: { paddingHorizontal: 16 },
  islandLabel: { fontFamily: font('sans', 'bold'), fontSize: 14, fontWeight: '700' },
  islandBadge: { position: 'absolute', top: 1, right: 1, minWidth: 19, height: 19, borderRadius: 10, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  islandBadgeText: { color: '#FFFFFF', fontFamily: font('mono', 'bold'), fontSize: 9, lineHeight: 11, fontWeight: '700' },
});
