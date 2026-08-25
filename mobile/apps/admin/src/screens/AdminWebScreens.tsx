import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CalendarDays, Camera, Image as ImageIcon, Inbox, Menu, MessageCircle, Mic, MoreHorizontal, Phone, Plus, Search, Send, UserRound } from 'lucide-react-native';
import { Badge, Button, Card, Field, Header, Metric, Screen, StickyHeader } from '../../../../shared/src/ui';
import { formatBaht, formatDate, todayIso } from '../../../../shared/src/format';
import { font, useColors } from '../../../../shared/src/theme';
import { api } from '../api';
import { config } from '../config';
import { store } from '../storage';

const dateTime = (value: string | null | undefined) => value ? new Date(value).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '-';
const LINE_GREEN = '#06C755';
const messagePreview = (value: unknown) => typeof value === 'string' && value.trim() ? value.replace(/\s+/g, ' ').trim() : 'ไม่มีข้อความ';

function StateText({ children, error = false }: { children: string; error?: boolean }) {
  const colors = useColors();
  return <Text style={[styles.stateText, { color: error ? colors.red : colors.muted }]}>{children}</Text>;
}

function RegistryScreen({ title, eyebrow, endpoint, queryKey, empty, nameLabel, idLabel, countLabel }: { title: string; eyebrow: string; endpoint: string; queryKey: string; empty: string; nameLabel: string; idLabel: string; countLabel: string }) {
  const colors = useColors();
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const list = useQuery({ queryKey: [queryKey], queryFn: () => api.get<any[]>(endpoint) });
  const rename = useMutation({ mutationFn: () => api.patch(`${endpoint}/${editingId}`, { name: draft.trim() }), onSuccess: async () => { setEditingId(null); setDraft(''); await qc.invalidateQueries({ queryKey: [queryKey] }); } });
  const rows = list.data ?? [];
  return <Screen stickyHeader={<StickyHeader><Header eyebrow={eyebrow} title={title} /></StickyHeader>}>{list.isLoading ? <StateText>กำลังโหลดข้อมูล…</StateText> : null}{list.isError ? <StateText error>โหลดข้อมูลไม่สำเร็จ</StateText> : null}{!list.isLoading && !rows.length ? <Card><StateText>{empty}</StateText></Card> : rows.map((row) => <Card key={row.id}><View style={styles.rowTop}><View style={styles.rowCopy}><Text style={[styles.rowTitle, { color: colors.ink }]}>{row.name || '-'}</Text><Text style={[styles.rowMeta, { color: colors.muted }]}>{idLabel}: {row.line_user_id || row.line_group_id || '-'}</Text></View><Badge tone={row.slip_count > 0 ? 'green' : 'muted'}>{row.slip_count ?? 0} {countLabel}</Badge></View>{editingId === row.id ? <View style={styles.editBox}><Field label={nameLabel} value={draft} onChangeText={setDraft} /><View style={styles.buttonRow}><View style={styles.buttonHalf}><Button title="ยกเลิก" secondary onPress={() => { setEditingId(null); setDraft(''); }} /></View><View style={styles.buttonHalf}><Button title={rename.isPending ? 'กำลังบันทึก…' : 'บันทึก'} disabled={!draft.trim() || rename.isPending} onPress={() => rename.mutate()} /></View></View></View> : <Button title="เปลี่ยนชื่อ" secondary onPress={() => { setEditingId(row.id); setDraft(row.name ?? ''); }} />}</Card>)}</Screen>;
}

export function SendersScreen() {
  return <RegistryScreen title="ผู้ส่งสลิป" eyebrow="รายงาน & ระบบ" endpoint="/api/senders" queryKey="mobile-senders" empty="ยังไม่มีผู้ส่งสลิปในกลุ่ม" nameLabel="ตั้งชื่อผู้ส่ง" idLabel="LINE userId" countLabel="สลิป" />;
}

export function GroupsScreen() {
  return <RegistryScreen title="กลุ่ม LINE" eyebrow="รายงาน & ระบบ" endpoint="/api/groups" queryKey="mobile-groups" empty="ยังไม่มีกลุ่มที่บอทเก็บสลิป" nameLabel="ตั้งชื่อกลุ่ม" idLabel="group id" countLabel="สลิป" />;
}

export function ReportsScreen() {
  const colors = useColors();
  const [fromDraft, setFromDraft] = useState('');
  const [toDraft, setToDraft] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [day, setDay] = useState(todayIso());
  const [dayDraft, setDayDraft] = useState(day);
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const summary = useQuery({ queryKey: ['mobile-report-summary', from, to], queryFn: () => api.get<any>(`/api/reports/summary${params.toString() ? `?${params}` : ''}`) });
  const daily = useQuery({ queryKey: ['mobile-report-daily', day], queryFn: () => api.get<any>(`/api/reports/daily?date=${day}`) });
  const overdue = useQuery({ queryKey: ['mobile-report-overdue'], queryFn: () => api.get<any[]>('/api/installments/overdue') });
  const s = summary.data;
  return <Screen stickyHeader={<StickyHeader><Header eyebrow="รายงาน & ระบบ" title="รายงาน" /></StickyHeader>}><Card><Text style={[styles.cardTitle, { color: colors.ink }]}>สรุปตามช่วงเวลา</Text><View style={styles.twoColumns}><View style={styles.column}><Field label="เริ่มวันที่" value={fromDraft} onChangeText={setFromDraft} placeholder="YYYY-MM-DD" /></View><View style={styles.column}><Field label="ถึงวันที่" value={toDraft} onChangeText={setToDraft} placeholder="YYYY-MM-DD" /></View></View><Button title="ค้นหา" onPress={() => { setFrom(fromDraft); setTo(toDraft); }} /></Card><View style={styles.metricGrid}><View style={styles.metricHalf}><Metric label="ยอดเก็บได้ (บาท)" value={formatBaht(s?.collected ?? 0)} /></View><View style={styles.metricHalf}><Metric label="จำนวนรายการชำระ" value={String(s?.payment_count ?? 0)} tone="green" /></View><View style={styles.metricHalf}><Metric label="สลิปรอตรวจ" value={String(s?.pending_count ?? 0)} tone="amber" /></View><View style={styles.metricHalf}><Metric label="งวดค้างชำระ" value={String(s?.overdue_count ?? 0)} tone="red" /></View><View style={styles.metricHalf}><Metric label="ยอดค้างชำระ (บาท)" value={formatBaht(s?.overdue_amount ?? 0)} tone="red" /></View><View style={styles.metricHalf}><Metric label="ลูกค้าทั้งหมด" value={String(s?.customers ?? 0)} /></View></View><Card><Text style={[styles.cardTitle, { color: colors.ink }]}>รายงานรายวัน — ต่อกลุ่ม LINE</Text><Field label="วันที่" value={dayDraft} onChangeText={setDayDraft} /><Button title="ค้นหารายวัน" secondary onPress={() => setDay(dayDraft)} />{daily.isLoading ? <StateText>กำลังโหลดรายงาน…</StateText> : null}{(daily.data?.groups ?? []).map((group: any) => <View key={group.line_group_id} style={[styles.reportRow, { borderBottomColor: colors.line }]}><View style={styles.rowCopy}><Text style={[styles.rowTitle, { color: colors.ink }]}>{group.name}</Text><Text style={[styles.rowMeta, { color: colors.muted }]}>รับ {group.received} · อนุมัติ {group.approved} · รอตรวจ {group.pending}</Text></View><Text style={[styles.amount, { color: colors.ink }]}>{formatBaht(group.amount)}</Text></View>)}{!daily.data?.groups?.length && !daily.isLoading ? <StateText>วันนี้ยังไม่มีสลิปจากกลุ่ม</StateText> : null}</Card><Card><Text style={[styles.cardTitle, { color: colors.ink }]}>ค้างชำระ ({overdue.data?.length ?? 0})</Text>{(overdue.data ?? []).slice(0, 30).map((item: any) => <View key={item.id} style={[styles.reportRow, { borderBottomColor: colors.line }]}><View style={styles.rowCopy}><Text style={[styles.rowTitle, { color: colors.ink }]}>{item.bill_plan?.customer?.display_name ?? item.bill_plan?.customer?.customer_code ?? '-'}</Text><Text style={[styles.rowMeta, { color: colors.muted }]}>บิล {item.bill_plan?.bill_no ?? '-'} · งวด {item.installment_no ?? '-'} · {formatDate(item.due_date)}</Text></View><Text style={[styles.amount, { color: colors.red }]}>{formatBaht(Number(item.amount_due) - Number(item.amount_paid ?? 0))}</Text></View>)}{!overdue.data?.length ? <StateText>ไม่มีงวดค้างชำระ</StateText> : null}</Card></Screen>;
}

export function LineOaScreen() {
  const colors = useColors();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [channelId, setChannelId] = useState('');
  const [secret, setSecret] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const list = useQuery({ queryKey: ['mobile-line-oa'], queryFn: () => api.get<any[]>('/api/line-oa-accounts') });
  const create = useMutation({ mutationFn: () => api.post('/api/line-oa-accounts', { name: name.trim(), channel_id: channelId.trim(), channel_secret: secret, channel_access_token: accessToken }), onSuccess: async () => { setOpen(false); setName(''); setChannelId(''); setSecret(''); setAccessToken(''); await qc.invalidateQueries({ queryKey: ['mobile-line-oa'] }); } });
  const toggle = useMutation({ mutationFn: (item: any) => api.patch(`/api/line-oa-accounts/${item.id}`, { is_active: !item.is_active }), onSuccess: () => qc.invalidateQueries({ queryKey: ['mobile-line-oa'] }) });
  return <Screen><Header eyebrow="รายงาน & ระบบ" title="LINE OA" />{open ? <Card><Text style={[styles.cardTitle, { color: colors.ink }]}>เพิ่ม LINE OA</Text><Field label="ชื่อ OA" value={name} onChangeText={setName} placeholder="เช่น ร้าน A" /><Field label="Channel ID" value={channelId} onChangeText={setChannelId} /><Field label="Channel Secret" value={secret} onChangeText={setSecret} secureTextEntry /><Field label="Channel Access Token" value={accessToken} onChangeText={setAccessToken} secureTextEntry /><Text style={[styles.hint, { color: colors.muted }]}>secret/token จะเก็บฝั่ง server และไม่แสดงกลับมา</Text><View style={styles.buttonRow}><View style={styles.buttonHalf}><Button title="ยกเลิก" secondary onPress={() => setOpen(false)} /></View><View style={styles.buttonHalf}><Button title={create.isPending ? 'กำลังบันทึก…' : 'เพิ่ม OA'} disabled={!name || !channelId || !secret || !accessToken || create.isPending} onPress={() => create.mutate()} /></View></View></Card> : <Button title="เพิ่ม LINE OA" onPress={() => setOpen(true)} />}{list.isLoading ? <StateText>กำลังโหลด LINE OA…</StateText> : null}{(list.data ?? []).map((item: any) => <Card key={item.id}><View style={styles.rowTop}><View style={styles.rowCopy}><Text style={[styles.rowTitle, { color: colors.ink }]}>{item.name}</Text><Text style={[styles.rowMeta, { color: colors.muted }]}>channel_id: {item.channel_id}</Text><Text style={[styles.rowMeta, { color: colors.muted }]}>Webhook: /api/line/webhook/{item.id}</Text></View><Badge tone={item.is_active ? 'green' : 'muted'}>{item.is_active ? 'active' : 'off'}</Badge></View><Button title={item.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'} secondary onPress={() => toggle.mutate(item)} /></Card>)}{!list.isLoading && !list.data?.length ? <Card><StateText>ยังไม่มี LINE OA</StateText></Card> : null}</Screen>;
}

const MESSAGE_FIELDS = [
  ['text_help', 'ข้อความทั่วไป / วิธีใช้งาน'], ['customer_balance_empty', 'ตอบยอด: ไม่มียอดค้าง'], ['customer_balance_due', 'ตอบยอด: มียอดค้าง'], ['customer_bills', 'ตอบเมนูบิล'], ['payment_received', 'ได้รับสลิปแล้ว'], ['cash_bill_received', 'ได้รับบิลเงินสด'], ['needs_admin_match', 'จับคู่สลิปไม่ได้'], ['payment_approved', 'อนุมัติสลิปแล้ว'], ['payment_rejected', 'ปฏิเสธสลิป'], ['duplicate_slip', 'สลิปซ้ำ'], ['unsupported_slip', 'ไฟล์สลิปไม่รองรับ'], ['rate_limited', 'ส่งสลิปถี่เกินไป'],
] as const;

export function MessageResponseSettingsScreen() {
  const colors = useColors();
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ['mobile-settings'], queryFn: () => api.get<any>('/api/settings') });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  useEffect(() => { const templates = settings.data?.message_templates; if (templates) setDrafts(Object.fromEntries(MESSAGE_FIELDS.map(([key]) => [key, templates[key] ?? '']))); }, [settings.data]);
  const save = useMutation({ mutationFn: () => api.patch('/api/settings', { message_templates: { ...drafts, custom_messages: settings.data?.message_templates?.custom_messages ?? [] } }), onSuccess: () => qc.invalidateQueries({ queryKey: ['mobile-settings'] }) });
  if (settings.isLoading) return <Screen><Header eyebrow="รายงาน & ระบบ" title="ข้อความตอบกลับ LINE" /><StateText>กำลังโหลดการตั้งค่าข้อความ…</StateText></Screen>;
  return <Screen><Header eyebrow="รายงาน & ระบบ" title="ข้อความตอบกลับ LINE" /><Card><Text style={[styles.cardTitle, { color: colors.ink }]}>ข้อความมาตรฐานขององค์กร</Text><Text style={[styles.hint, { color: colors.muted }]}>แก้ไขข้อความที่ระบบใช้ตอบกลับ LINE ได้จากหน้านี้</Text>{MESSAGE_FIELDS.map(([key, label]) => <View key={key} style={[styles.messageBox, { borderColor: colors.line }]}><Text style={[styles.messageLabel, { color: colors.ink }]}>{label}</Text><TextInput multiline value={drafts[key] ?? ''} onChangeText={(value) => setDrafts((current) => ({ ...current, [key]: value }))} style={[styles.multilineInput, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.paper }]} placeholder="ใช้ค่าเริ่มต้นของระบบ" placeholderTextColor={colors.muted} /></View>)}<Button title={save.isPending ? 'กำลังบันทึก…' : 'บันทึกข้อความทั้งหมด'} disabled={save.isPending} onPress={() => save.mutate()} /></Card></Screen>;
}

export function SettingsScreen() {
  const colors = useColors();
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ['mobile-org-settings'], queryFn: () => api.get<any>('/api/settings') });
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('Asia/Bangkok');
  const [footer, setFooter] = useState('');
  const [reminderHour, setReminderHour] = useState('9');
  const [deadlineHour, setDeadlineHour] = useState('18');
  const [reminderText, setReminderText] = useState('');
  const [retention, setRetention] = useState('30');
  const [autoApprove, setAutoApprove] = useState(false);
  useEffect(() => { const data = settings.data; if (!data) return; setName(data.name ?? ''); setTimezone(data.timezone ?? 'Asia/Bangkok'); setFooter(data.bill_footer ?? ''); setReminderHour(String(data.reminder_hour ?? 9)); setDeadlineHour(String(data.deadline_hour ?? 18)); setReminderText(data.reminder_text ?? ''); setRetention(String(data.slip_retention_days ?? 30)); setAutoApprove(Boolean(data.auto_approve_enabled)); }, [settings.data]);
  const save = useMutation({ mutationFn: () => api.patch('/api/settings', { name: name.trim(), timezone: timezone.trim(), bill_footer: footer, reminder_hour: Number(reminderHour), deadline_hour: Number(deadlineHour), reminder_text: reminderText, slip_retention_days: retention ? Number(retention) : null, auto_approve_enabled: autoApprove }), onSuccess: () => qc.invalidateQueries({ queryKey: ['mobile-org-settings'] }) });
  return <Screen><Header eyebrow="รายงาน & ระบบ" title="ตั้งค่า" />{settings.isLoading ? <StateText>กำลังโหลดการตั้งค่า…</StateText> : <Card><Text style={[styles.cardTitle, { color: colors.ink }]}>ตั้งค่าองค์กรและระบบ</Text><Field label="ชื่อองค์กร" value={name} onChangeText={setName} /><Field label="Timezone" value={timezone} onChangeText={setTimezone} /><Field label="ข้อความท้ายบิล" value={footer} onChangeText={setFooter} placeholder="ข้อความที่แสดงท้ายใบแจ้งหนี้" /><View style={styles.twoColumns}><View style={styles.column}><Field label="เวลาแจ้งเตือน" value={reminderHour} onChangeText={setReminderHour} keyboardType="numeric" /></View><View style={styles.column}><Field label="เวลา deadline" value={deadlineHour} onChangeText={setDeadlineHour} keyboardType="numeric" /></View></View><Field label="ข้อความแจ้งเตือน" value={reminderText} onChangeText={setReminderText} /><Field label="เก็บสลิปกี่วัน" value={retention} onChangeText={setRetention} keyboardType="numeric" /><Pressable accessibilityRole="checkbox" onPress={() => setAutoApprove((value) => !value)} style={[styles.toggle, { borderColor: colors.line, backgroundColor: autoApprove ? colors.greenSoft : colors.paper }]}><View style={[styles.toggleDot, { backgroundColor: autoApprove ? colors.green : colors.muted }]} /><Text style={[styles.toggleText, { color: colors.ink }]}>เปิดอนุมัติสลิปอัตโนมัติ</Text><Text style={[styles.toggleState, { color: autoApprove ? colors.green : colors.muted }]}>{autoApprove ? 'เปิด' : 'ปิด'}</Text></Pressable><Button title={save.isPending ? 'กำลังบันทึก…' : 'บันทึกการตั้งค่า'} disabled={save.isPending} onPress={() => save.mutate()} /></Card>}</Screen>;
}

export function LogsScreen() {
  const colors = useColors();
  const [tab, setTab] = useState<'audit' | 'inbound'>('audit');
  const [page, setPage] = useState(1);
  const audit = useQuery({ queryKey: ['mobile-audit', page], queryFn: () => api.get<any>(`/api/audit-logs?page=${page}&limit=30`) });
  const inbound = useQuery({ queryKey: ['mobile-inbound', page], queryFn: () => api.get<any>(`/api/message-logs?page=${page}&limit=30`) });
  const data = tab === 'audit' ? audit.data : inbound.data;
  const items = data?.items ?? [];
  return <Screen><Header eyebrow="รายงาน & ระบบ" title="ประวัติ" /><View style={[styles.tabRow, { borderColor: colors.line }]}><Pressable onPress={() => { setTab('audit'); setPage(1); }} style={[styles.tab, tab === 'audit' && { backgroundColor: colors.coral }]}><Text style={[styles.tabText, { color: tab === 'audit' ? '#FFFFFF' : colors.ink }]}>Audit log</Text></Pressable><Pressable onPress={() => { setTab('inbound'); setPage(1); }} style={[styles.tab, tab === 'inbound' && { backgroundColor: colors.coral }]}><Text style={[styles.tabText, { color: tab === 'inbound' ? '#FFFFFF' : colors.ink }]}>ข้อความ LINE</Text></Pressable></View>{items.map((item: any) => <Card key={item.id}><Text style={[styles.rowTitle, { color: colors.ink }]}>{tab === 'audit' ? item.action : item.message_text || item.message_type}</Text><Text style={[styles.rowMeta, { color: colors.muted }]}>{dateTime(tab === 'audit' ? item.created_at : item.sent_at)}</Text><Text numberOfLines={4} style={[styles.logBody, { color: colors.muted }]}>{tab === 'audit' ? `${item.entity_type ?? '-'} · ${item.actor_type ?? '-'}` : `${item.source_name ?? item.line_user_id ?? '-'} · ${item.status ?? '-'}`}</Text></Card>)}{!items.length ? <Card><StateText>{tab === 'audit' ? 'ยังไม่มีประวัติ' : 'ยังไม่มีข้อความขาเข้า'}</StateText></Card> : null}<View style={styles.pagination}><Button title="ก่อนหน้า" secondary disabled={page <= 1} onPress={() => setPage((value) => value - 1)} /><Text style={[styles.pageText, { color: colors.muted }]}>{page} / {Math.max(1, Math.ceil((data?.total ?? 0) / 30))}</Text><Button title="ถัดไป" secondary disabled={page >= Math.ceil((data?.total ?? 0) / 30)} onPress={() => setPage((value) => value + 1)} /></View></Screen>;
}

export function ChatCloneScreen() {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const isWide = width >= 760;
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const conversations = useQuery({ queryKey: ['mobile-conversations', query], queryFn: () => api.get<any>(`/api/conversations?page=1&limit=50&search=${encodeURIComponent(query)}`), refetchInterval: 30_000 });
  const conversationItems = conversations.data?.items;
  const items = useMemo(() => conversationItems ?? [], [conversationItems]);
  const detail = useQuery({ queryKey: ['mobile-conversation', selectedId], queryFn: () => api.get<any>(`/api/conversations/${encodeURIComponent(selectedId ?? '')}`), enabled: Boolean(selectedId), refetchInterval: 30_000 });

  useEffect(() => {
    if (!items.length) {
      setSelectedId(null);
      return;
    }
    if (selectedId && !items.some((item: any) => item.key === selectedId)) setSelectedId(null);
  }, [items, selectedId]);

  const selectedItem = items.find((item: any) => item.key === selectedId);
  const active = selectedItem ? { ...selectedItem, ...(detail.data?.conversation ?? {}) } : detail.data?.conversation;
  if (!isWide) return <MobileChatClone active={active} detail={detail} items={items} onBack={() => setSelectedId(null)} onSelect={setSelectedId} />;
  return <Screen scroll={false}>
    <Header eyebrow="รายงาน & ระบบ" title="Chatclone" right={<Badge tone="muted">{conversations.data?.total ?? 0} สนทนา</Badge>} />
    <View style={[styles.chatShell, { backgroundColor: colors.paper, borderColor: colors.line }, isWide && styles.chatShellWide]}>
      <View style={[styles.conversationPane, { backgroundColor: colors.dashboardCardMuted, borderBottomColor: colors.line }, isWide && [styles.conversationPaneWide, { borderRightColor: colors.line }], !isWide && selectedId ? styles.mobileHidden : null]}>
        <View style={[styles.chatSearchRow, { borderBottomColor: colors.line }]}>
          <View style={[styles.chatSearchBox, { backgroundColor: colors.paper, borderColor: colors.line }]}>
            <Search size={16} color={colors.muted} />
            <TextInput value={search} onChangeText={setSearch} onSubmitEditing={() => setQuery(search.trim())} placeholder="ค้นหาชื่อ / LINE ID / ข้อความ" placeholderTextColor={colors.muted} returnKeyType="search" style={[styles.chatSearchInput, { color: colors.ink }]} />
          </View>
          <Pressable accessibilityLabel="ค้นหาบทสนทนา" accessibilityRole="button" onPress={() => setQuery(search.trim())} style={({ pressed }) => [styles.searchButton, { backgroundColor: LINE_GREEN, opacity: pressed ? 0.75 : 1 }]}><Search size={17} color="#FFFFFF" /></Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.conversationList} keyboardShouldPersistTaps="handled">
          {conversations.isLoading ? <StateText>กำลังโหลดประวัติ…</StateText> : null}
          {!conversations.isLoading && !items.length ? <View style={styles.chatEmpty}><Inbox size={34} color={colors.muted} /><Text style={[styles.chatEmptyTitle, { color: colors.ink }]}>ยังไม่มีประวัติการสนทนา</Text><Text style={[styles.chatEmptyText, { color: colors.muted }]}>ลองค้นหาด้วยชื่อ, LINE ID หรือข้อความ</Text></View> : null}
          {items.map((item: any) => {
            const selected = selectedId === item.key;
            return <Pressable key={item.key} accessibilityRole="button" onPress={() => setSelectedId(item.key)} style={({ pressed }) => [styles.conversationItem, { backgroundColor: selected ? colors.coralSoft : colors.paper, borderBottomColor: colors.line, opacity: pressed ? 0.75 : 1 }]}>
              <View style={[styles.avatar, { backgroundColor: selected ? LINE_GREEN : colors.paper, borderColor: colors.line }]}><UserRound size={19} color={selected ? '#FFFFFF' : colors.muted} /></View>
              <View style={styles.conversationCopy}><View style={styles.conversationTitleRow}><Text numberOfLines={1} style={[styles.conversationTitle, { color: colors.ink }]}>{item.title}</Text><Text style={[styles.conversationTime, { color: colors.muted }]}>{dateTime(item.last_message_at).slice(-5)}</Text></View><Text numberOfLines={1} style={[styles.conversationPreview, { color: colors.muted }]}>{item.last_direction === 'outbound' ? 'คุณ: ' : 'ลูกค้า: '}{messagePreview(item.last_message)}</Text></View>
            </Pressable>;
          })}
        </ScrollView>
      </View>
      <View style={[styles.chatDetailPane, { backgroundColor: colors.dashboardCardMuted }, !isWide && !selectedId ? styles.mobileHidden : null]}>
        {active ? <>
          <View style={[styles.chatDetailHeader, { borderBottomColor: colors.line, backgroundColor: colors.paper }]}>
            {!isWide ? <Pressable accessibilityLabel="กลับไปยังรายการสนทนา" accessibilityRole="button" onPress={() => setSelectedId(null)} style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.55 : 1 }]}><ArrowLeft size={21} color={colors.ink} /></Pressable> : null}
            <View style={[styles.detailAvatar, { backgroundColor: LINE_GREEN }]}><UserRound size={20} color="#FFFFFF" /></View>
            <View style={styles.detailCopy}><Text numberOfLines={1} style={[styles.detailTitle, { color: colors.ink }]}>{active.title}</Text><Text numberOfLines={1} style={[styles.detailMeta, { color: colors.muted }]}>{active.customer?.customer_code ? `${active.customer.customer_code} · ` : ''}{active.line_user_id}</Text></View>
            <Badge tone="muted">{active.message_count ?? 0} ข้อความ</Badge>
          </View>
          <ScrollView style={styles.messageScroll} contentContainerStyle={styles.messageList} keyboardShouldPersistTaps="handled">
            {detail.isLoading ? <StateText>กำลังโหลดข้อความ…</StateText> : null}
            {(detail.data?.messages ?? []).map((message: any) => <MessageBubble key={message.id} message={message} />)}
          </ScrollView>
        </> : <View style={styles.noConversation}><MessageCircle size={42} color={colors.muted} /><Text style={[styles.chatEmptyTitle, { color: colors.ink }]}>เลือกบทสนทนาเพื่อดูประวัติ</Text><Text style={[styles.chatEmptyText, { color: colors.muted }]}>ข้อความเข้าและข้อความตอบกลับจะเรียงตามเวลา</Text></View>}
      </View>
    </View>
  </Screen>;
}

function MobileChatIcon({ label, onPress, children }: { label: string; onPress: () => void; children: ReactNode }) {
  return <Pressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.mobileChatIcon, { opacity: pressed ? 0.55 : 1 }]}>{children}</Pressable>;
}

function MobileChatClone({ active, detail, items, onBack, onSelect }: { active: any; detail: any; items: any[]; onBack: () => void; onSelect: (id: string) => void }) {
  const colors = useColors();
  const [draft, setDraft] = useState('');
  const [localMessages, setLocalMessages] = useState<string[]>([]);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const messageRef = useRef<any>(null);
  const searchItems = searchText.trim() ? items.filter((item: any) => `${item.title ?? ''} ${item.line_user_id ?? ''} ${item.last_message ?? ''}`.toLowerCase().includes(searchText.trim().toLowerCase())) : items;

  useEffect(() => {
    if (localMessages.length) messageRef.current?.scrollToEnd({ animated: true });
  }, [localMessages.length]);

  useEffect(() => {
    setToolsOpen(false);
  }, [active?.key]);

  function sendDraft() {
    const message = draft.trim();
    if (!message) return;
    setLocalMessages((messages) => [...messages, message]);
    setDraft('');
  }

  function callCustomer() {
    const phone = active?.customer?.phone?.replace(/[^\d+]/g, '');
    if (!phone) {
      Alert.alert('ยังไม่มีเบอร์โทรศัพท์', 'บทสนทนานี้ยังไม่มีเบอร์โทรศัพท์ของลูกค้า');
      return;
    }
    Linking.openURL(`tel:${phone}`).catch(() => Alert.alert('โทรไม่สำเร็จ', 'ไม่สามารถเปิดแอปโทรศัพท์ได้'));
  }

  return <Screen scroll={false} style={styles.mobileChatScreen}>
      <KeyboardAvoidingView style={styles.mobileChatRoot} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.mobileChatHeader, { backgroundColor: colors.paper, borderBottomColor: colors.line }]}>
        {active ? <MobileChatIcon label="กลับไปยังรายการสนทนา" onPress={() => { setSearchText(''); setSearchOpen(true); onBack(); }}><ArrowLeft size={25} color={colors.ink} /></MobileChatIcon> : null}
        <View style={[styles.mobileChatUnread, { backgroundColor: colors.green }]}><Text style={[styles.mobileChatUnreadText, { color: colors.paper }]}>99+</Text></View>
        <View style={styles.mobileChatHeaderCopy}><Text numberOfLines={1} style={[styles.mobileChatTitle, { color: colors.ink }]}>{active?.title ?? 'Chatclone'}</Text><Text numberOfLines={1} style={[styles.mobileChatSubtitle, { color: colors.muted }]}>{active?.customer?.customer_code ? `${active.customer.customer_code} · ` : ''}{active?.line_user_id ?? 'ประวัติการสนทนา'}</Text></View>
        <Badge tone="muted">{active?.message_count ?? items.length} สนทนา</Badge>
        <View style={styles.mobileChatActions}>
          <MobileChatIcon label="ค้นหาในแชต" onPress={() => setSearchOpen((value) => !value)}><Search size={21} color={colors.ink} /></MobileChatIcon>
          <MobileChatIcon label="โทรหาลูกค้า" onPress={callCustomer}><Phone size={21} color={colors.ink} /></MobileChatIcon>
          <MobileChatIcon label="ดูวันที่ล่าสุด" onPress={() => Alert.alert('แชตนี้', active?.last_message_at ? dateTime(active.last_message_at) : 'ยังไม่มีข้อความ')}><CalendarDays size={21} color={colors.ink} /></MobileChatIcon>
          <MobileChatIcon label="เครื่องมือเพิ่มเติม" onPress={() => setToolsOpen((value) => !value)}><Menu size={23} color={colors.ink} /></MobileChatIcon>
        </View>
      </View>

      {searchOpen || !active ? <View style={[styles.mobileChatSearchTray, { backgroundColor: colors.paper, borderBottomColor: colors.line }]}><View style={[styles.mobileChatSearchBox, { backgroundColor: colors.cream, borderColor: colors.line }]}><Search size={16} color={colors.muted} /><TextInput value={searchText} onChangeText={setSearchText} placeholder={active ? 'ค้นหาชื่อ / LINE ID' : 'ค้นหาชื่อ / LINE ID / ข้อความ'} placeholderTextColor={colors.muted} style={[styles.mobileChatSearchInput, { color: colors.ink }]} /></View>{searchText.trim() ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mobileChatSearchResults}>{searchItems.map((item: any) => <Pressable key={item.key} onPress={() => { onSelect(item.key); setSearchOpen(false); setSearchText(''); }} style={[styles.mobileChatResult, { borderColor: colors.line, backgroundColor: colors.cream }]}><Text numberOfLines={1} style={[styles.mobileChatResultText, { color: colors.ink }]}>{item.title}</Text></Pressable>)}</ScrollView> : null}</View> : null}
      {toolsOpen ? <View style={[styles.mobileChatToolTray, { backgroundColor: colors.paper, borderBottomColor: colors.line }]}><Pressable onPress={() => { setSearchText(''); setSearchOpen(true); onBack(); }} style={[styles.mobileChatTool, { borderColor: colors.line, backgroundColor: colors.cream }]}><MoreHorizontal size={16} color={colors.ink} /><Text style={[styles.mobileChatToolText, { color: colors.ink }]}>รายการแชต</Text></Pressable><Pressable onPress={() => void detail.refetch()} style={[styles.mobileChatTool, { borderColor: colors.line, backgroundColor: colors.cream }]}><CalendarDays size={16} color={colors.ink} /><Text style={[styles.mobileChatToolText, { color: colors.ink }]}>รีเฟรช</Text></Pressable><Pressable onPress={() => Alert.alert('Chatclone', 'หน้านี้แสดงข้อความจาก LINE ตามสิทธิ์ขององค์กร')} style={[styles.mobileChatTool, { borderColor: colors.line, backgroundColor: colors.cream }]}><MoreHorizontal size={16} color={colors.ink} /><Text style={[styles.mobileChatToolText, { color: colors.ink }]}>ข้อมูล</Text></Pressable></View> : null}

      <View style={[styles.mobileChatBody, { backgroundColor: colors.cream }]}>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}><View style={[styles.mobileChatRing, { borderColor: colors.line }]} /><View style={[styles.mobileChatLine, { backgroundColor: colors.line }]} /><View style={[styles.mobileChatDot, { backgroundColor: colors.greenSoft, borderColor: colors.line }]} /></View>
        <ScrollView ref={messageRef} style={styles.mobileChatMessages} contentContainerStyle={styles.mobileChatMessageList} keyboardShouldPersistTaps="handled">
          <View style={styles.mobileDayPill}><Text style={[styles.mobileDayText, { color: colors.muted, backgroundColor: colors.paper }]}>วันนี้</Text></View>
          {active ? <><View style={styles.mobileChatAgent}><View style={[styles.mobileChatAgentAvatar, { backgroundColor: colors.navy }]}><Text style={[styles.mobileChatAgentText, { color: colors.paper }]}>TH</Text></View><Text style={[styles.mobileChatAgentLabel, { color: colors.muted }]}>Chatclone</Text></View>{detail.isLoading ? <StateText>กำลังโหลดข้อความ…</StateText> : null}{(detail.data?.messages ?? []).map((message: any) => <MessageBubble key={message.id} message={message} accentColor={colors.green} />)}{localMessages.map((message, index) => <View key={`${message}-${index}`} style={[styles.mobileLocalRow, { alignItems: 'flex-end' }]}><View style={[styles.mobileLocalBubble, { backgroundColor: colors.green, borderColor: colors.green }]}><Text style={[styles.mobileLocalText, { color: colors.paper }]}>{message}</Text></View><Text style={[styles.messageMeta, { color: colors.muted }]}>คุณ · ตอนนี้</Text></View>)}{!detail.isLoading && !(detail.data?.messages ?? []).length && !localMessages.length ? <View style={[styles.mobileChatEmptyBubble, { backgroundColor: colors.paper, borderColor: colors.line }]}><Text style={[styles.mobileChatEmptyTitle, { color: colors.ink }]}>ยังไม่มีข้อความในบทสนทนา</Text><Text style={[styles.mobileChatEmptyText, { color: colors.muted }]}>{active.last_message ? `ลูกค้า: ${messagePreview(active.last_message)}` : 'ข้อความเข้าและข้อความตอบกลับจะแสดงที่นี่'}</Text></View> : null}</> : <View style={styles.mobileConversationPicker}><MessageCircle size={40} color={colors.muted} /><Text style={[styles.mobileChatEmptyTitle, { color: colors.ink }]}>เลือกบทสนทนา</Text>{searchItems.map((item: any) => <Pressable key={item.key} onPress={() => onSelect(item.key)} style={[styles.mobilePickerItem, { borderColor: colors.line, backgroundColor: colors.paper }]}><UserRound size={18} color={colors.muted} /><View style={styles.conversationCopy}><Text style={[styles.conversationTitle, { color: colors.ink }]}>{item.title}</Text><Text numberOfLines={1} style={[styles.conversationPreview, { color: colors.muted }]}>{item.last_direction === 'outbound' ? 'คุณ: ' : 'ลูกค้า: '}{messagePreview(item.last_message)}</Text></View></Pressable>)}</View>}
        </ScrollView>
      </View>

      {active ? <View style={[styles.mobileChatComposer, { backgroundColor: colors.paper, borderTopColor: colors.line }]}><View style={styles.mobileChatComposerRow}><MobileChatIcon label="เพิ่มไฟล์" onPress={() => setToolsOpen((value) => !value)}><Plus size={25} color={colors.ink} /></MobileChatIcon><MobileChatIcon label="กล้อง" onPress={() => setToolsOpen(true)}><Camera size={21} color={colors.ink} /></MobileChatIcon><MobileChatIcon label="รูปภาพ" onPress={() => setToolsOpen(true)}><ImageIcon size={22} color={colors.ink} /></MobileChatIcon><View style={[styles.mobileChatComposerInputWrap, { backgroundColor: colors.cream, borderColor: colors.line }]}><TextInput value={draft} onChangeText={setDraft} onSubmitEditing={sendDraft} returnKeyType="send" placeholder="พิมพ์ข้อความ…" placeholderTextColor={colors.muted} style={[styles.mobileChatComposerInput, { color: colors.ink }]} /><Text style={[styles.mobileChatComposerHint, { color: colors.muted }]}>Aa</Text></View><MobileChatIcon label={draft.trim() ? 'ส่งข้อความตัวอย่าง' : 'เครื่องมือเสียง'} onPress={draft.trim() ? sendDraft : () => setToolsOpen((value) => !value)}>{draft.trim() ? <Send size={21} color={colors.green} /> : <Mic size={22} color={colors.ink} />}</MobileChatIcon></View></View> : null}
    </KeyboardAvoidingView>
  </Screen>;
}

function MessageBubble({ message, accentColor = LINE_GREEN }: { message: any; accentColor?: string }) {
  const colors = useColors();
  const outbound = message.direction === 'outbound';
  return <View style={[styles.messageRow, { justifyContent: outbound ? 'flex-end' : 'flex-start' }]}><View style={[styles.messageWrap, { alignItems: outbound ? 'flex-end' : 'flex-start' }]}><View style={[styles.messageBubble, { backgroundColor: outbound ? accentColor : colors.paper, borderColor: outbound ? accentColor : colors.line, borderBottomRightRadius: outbound ? 5 : 18, borderBottomLeftRadius: outbound ? 18 : 5 }]}>{message.message_type === 'inbound_image' ? <ImageMessage id={message.id} /> : <Text style={[styles.messageText, { color: outbound ? '#FFFFFF' : colors.ink }]}>{message.message_text || `[${message.message_type}]`}</Text>}{message.status === 'failed' ? <Text style={[styles.failedText, { color: outbound ? '#E8FFF0' : colors.red }]}>ส่งไม่สำเร็จ: {message.error_message || 'ไม่ทราบสาเหตุ'}</Text> : null}</View><Text style={[styles.messageMeta, { color: colors.muted }]}>{outbound ? 'ระบบ' : message.source_name || 'ลูกค้า'} · {dateTime(message.sent_at)}</Text></View></View>;
}

function ImageMessage({ id }: { id: string }) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<{ uri: string; headers: Record<string, string> } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const openImage = async () => {
    setLoading(true);
    setError(false);
    try {
      const token = await api.getToken();
      const orgId = await store.get('org_id');
      setSource({ uri: `${config.apiBaseUrl.replace(/\/$/, '')}/api/conversation-messages/${encodeURIComponent(id)}/image`, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(orgId ? { 'x-org-id': orgId } : {}) } });
      setOpen(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };
  if (open && source) return <Image source={source} onError={() => setError(true)} style={styles.messageImage} resizeMode="contain" />;
  return <Pressable accessibilityRole="button" onPress={() => void openImage()} disabled={loading} style={styles.imageLink}><Text style={[styles.imageLinkText, { color: colors.coralText }]}>{loading ? 'กำลังโหลดรูปภาพ…' : error ? 'ลองเปิดรูปภาพอีกครั้ง' : 'เปิดดูรูปภาพ'}</Text></Pressable>;
}

const styles = StyleSheet.create({
  stateText: { fontFamily: font('sans'), fontSize: 13, lineHeight: 20 },
  cardTitle: { fontFamily: font('heading', 'bold'), fontSize: 17, fontWeight: '700' },
  hint: { fontFamily: font('sans'), fontSize: 12, lineHeight: 18 },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  rowCopy: { flex: 1, minWidth: 0, gap: 4 },
  rowTitle: { fontFamily: font('sans', 'bold'), fontSize: 15, fontWeight: '700' },
  rowMeta: { fontFamily: font('sans'), fontSize: 11, lineHeight: 17 },
  amount: { maxWidth: 130, fontFamily: font('mono', 'bold'), fontSize: 11, fontWeight: '700', textAlign: 'right' },
  editBox: { gap: 9 },
  buttonRow: { flexDirection: 'row', gap: 8 },
  buttonHalf: { flex: 1, minWidth: 0 },
  twoColumns: { flexDirection: 'row', gap: 8 },
  column: { flex: 1, minWidth: 0 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metricHalf: { width: '48%', minWidth: 0 },
  reportRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  messageBox: { gap: 7, borderWidth: 1, borderRadius: 14, padding: 11 },
  messageLabel: { fontFamily: font('sans', 'bold'), fontSize: 13, fontWeight: '700' },
  multilineInput: { minHeight: 86, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, textAlignVertical: 'top', fontFamily: font('sans'), fontSize: 13, lineHeight: 20 },
  toggle: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12 },
  toggleDot: { width: 10, height: 10, borderRadius: 5 },
  toggleText: { flex: 1, fontFamily: font('sans', 'semibold'), fontSize: 13, fontWeight: '600' },
  toggleState: { fontFamily: font('mono', 'bold'), fontSize: 11, fontWeight: '700' },
  tabRow: { flexDirection: 'row', gap: 4, borderWidth: 1, borderRadius: 12, padding: 3 },
  tab: { flex: 1, minHeight: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontFamily: font('sans', 'semibold'), fontSize: 12, fontWeight: '600' },
  logBody: { fontFamily: font('sans'), fontSize: 12, marginTop: 6 },
  pagination: { flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'center', paddingBottom: 20 },
  pageText: { fontFamily: font('mono'), fontSize: 11 },
  chatShell: { flex: 1, minHeight: 0, borderWidth: 1, borderRadius: 20, overflow: 'hidden' },
  chatShellWide: { flexDirection: 'row' },
  conversationPane: { flex: 1, minHeight: 250 },
  conversationPaneWide: { flex: 0, width: 300, minHeight: 0, borderRightWidth: 1 },
  chatSearchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderBottomWidth: 1 },
  chatSearchBox: { flex: 1, minWidth: 0, height: 42, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 21, paddingHorizontal: 13 },
  chatSearchInput: { flex: 1, minWidth: 0, paddingVertical: 0, fontFamily: font('sans'), fontSize: 12 },
  searchButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  conversationList: { paddingBottom: 12 },
  conversationItem: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  conversationCopy: { flex: 1, minWidth: 0, gap: 4 },
  conversationTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  conversationTitle: { flex: 1, minWidth: 0, fontFamily: font('sans', 'bold'), fontSize: 13, fontWeight: '700' },
  conversationTime: { fontFamily: font('mono'), fontSize: 10 },
  conversationPreview: { fontFamily: font('sans'), fontSize: 11, lineHeight: 17 },
  chatEmpty: { alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 20, paddingVertical: 42 },
  chatEmptyTitle: { fontFamily: font('sans', 'bold'), fontSize: 14, fontWeight: '700', textAlign: 'center' },
  chatEmptyText: { fontFamily: font('sans'), fontSize: 12, lineHeight: 18, textAlign: 'center' },
  chatDetailPane: { flex: 1, minHeight: 0 },
  chatDetailHeader: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1 },
  backButton: { width: 30, height: 36, alignItems: 'center', justifyContent: 'center' },
  detailAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  detailCopy: { flex: 1, minWidth: 0, gap: 3 },
  detailTitle: { fontFamily: font('sans', 'bold'), fontSize: 14, fontWeight: '700' },
  detailMeta: { fontFamily: font('mono'), fontSize: 10 },
  messageScroll: { flex: 1 },
  messageList: { gap: 6, paddingHorizontal: 14, paddingTop: 18, paddingBottom: 28 },
  messageRow: { width: '100%', flexDirection: 'row' },
  messageWrap: { maxWidth: '86%', gap: 4 },
  messageBubble: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 13, paddingVertical: 10, gap: 5, shadowColor: '#0F172A', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  messageText: { fontFamily: font('sans'), fontSize: 13, lineHeight: 20 },
  messageMeta: { fontFamily: font('sans'), fontSize: 10, lineHeight: 15 },
  failedText: { fontFamily: font('sans'), fontSize: 10, lineHeight: 15 },
  imageLink: { minWidth: 120, minHeight: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingHorizontal: 10 },
  imageLinkText: { fontFamily: font('sans', 'semibold'), fontSize: 12, fontWeight: '600' },
  messageImage: { width: 220, height: 180, borderRadius: 12, backgroundColor: '#00000010' },
  noConversation: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 30 },
  mobileHidden: { display: 'none' },
  mobileChatScreen: { padding: 0, paddingBottom: 0, gap: 0 },
  mobileChatRoot: { flex: 1 },
  mobileChatHeader: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
  mobileChatIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  mobileChatUnread: { minWidth: 35, height: 25, borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  mobileChatUnreadText: { fontFamily: font('mono', 'bold'), fontSize: 10, fontWeight: '700' },
  mobileChatHeaderCopy: { flex: 1, minWidth: 0, gap: 2, paddingHorizontal: 3 },
  mobileChatTitle: { fontFamily: font('heading', 'bold'), fontSize: 17, fontWeight: '700' },
  mobileChatSubtitle: { fontFamily: font('mono'), fontSize: 10 },
  mobileChatActions: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  mobileChatSearchTray: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 9, borderBottomWidth: 1, gap: 8 },
  mobileChatSearchBox: { height: 40, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 20, paddingHorizontal: 13 },
  mobileChatSearchInput: { flex: 1, minWidth: 0, paddingVertical: 0, fontFamily: font('sans'), fontSize: 12 },
  mobileChatSearchResults: { gap: 7 },
  mobileChatResult: { maxWidth: 150, borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7 },
  mobileChatResultText: { fontFamily: font('sans', 'semibold'), fontSize: 11, fontWeight: '600' },
  mobileChatToolTray: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 9, borderBottomWidth: 1 },
  mobileChatTool: { flex: 1, minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1, borderRadius: 11, paddingHorizontal: 6 },
  mobileChatToolText: { fontFamily: font('sans', 'semibold'), fontSize: 11, fontWeight: '600' },
  mobileChatBody: { flex: 1, minHeight: 0, position: 'relative' },
  mobileChatRing: { position: 'absolute', width: 240, height: 240, right: -100, top: 80, borderWidth: 1, borderRadius: 120, opacity: 0.18 },
  mobileChatLine: { position: 'absolute', width: 500, height: 1, left: -100, top: 280, transform: [{ rotate: '-12deg' }], opacity: 0.15 },
  mobileChatDot: { position: 'absolute', width: 170, height: 170, left: -85, bottom: 120, borderWidth: 1, borderRadius: 85, opacity: 0.18 },
  mobileChatMessages: { flex: 1 },
  mobileChatMessageList: { gap: 8, paddingHorizontal: 14, paddingTop: 16, paddingBottom: 20 },
  mobileDayPill: { alignItems: 'center', marginBottom: 2 },
  mobileDayText: { overflow: 'hidden', borderRadius: 999, paddingHorizontal: 13, paddingVertical: 6, fontFamily: font('sans', 'semibold'), fontSize: 11, fontWeight: '600' },
  mobileChatAgent: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 4, paddingBottom: 1 },
  mobileChatAgentAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  mobileChatAgentText: { fontFamily: font('mono', 'bold'), fontSize: 9, fontWeight: '700' },
  mobileChatAgentLabel: { fontFamily: font('sans', 'semibold'), fontSize: 11, fontWeight: '600' },
  mobileChatEmptyBubble: { alignSelf: 'flex-start', maxWidth: '86%', borderWidth: 1, borderRadius: 18, borderTopLeftRadius: 7, padding: 14, gap: 4 },
  mobileChatEmptyTitle: { fontFamily: font('sans', 'bold'), fontSize: 14, fontWeight: '700' },
  mobileChatEmptyText: { fontFamily: font('sans'), fontSize: 12, lineHeight: 18 },
  mobileConversationPicker: { alignItems: 'center', gap: 9, paddingTop: 18 },
  mobilePickerItem: { width: '100%', minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderRadius: 14, padding: 10 },
  mobileLocalRow: { width: '100%', gap: 4 },
  mobileLocalBubble: { maxWidth: '82%', borderWidth: 1, borderRadius: 18, borderBottomRightRadius: 5, paddingHorizontal: 13, paddingVertical: 10 },
  mobileLocalText: { fontFamily: font('sans'), fontSize: 13, lineHeight: 20 },
  mobileChatComposer: { paddingHorizontal: 10, paddingTop: 9, paddingBottom: 8, borderTopWidth: 1 },
  mobileChatComposerRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  mobileChatComposerInputWrap: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 23, paddingLeft: 14, paddingRight: 9 },
  mobileChatComposerInput: { flex: 1, minWidth: 0, paddingVertical: 9, fontFamily: font('sans'), fontSize: 14 },
  mobileChatComposerHint: { width: 24, height: 22, textAlign: 'center', lineHeight: 22, fontFamily: font('sans'), fontSize: 11 },
});
