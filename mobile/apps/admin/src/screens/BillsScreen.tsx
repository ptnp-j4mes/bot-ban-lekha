import { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, Field, Header, Screen } from '../../../../shared/src/ui';
import { formatBaht, formatDate, statusLabel, todayIso } from '../../../../shared/src/format';
import { useColors } from '../../../../shared/src/theme';
import type { BankAccount, BillPlan, Customer } from '../../../../shared/src/types';
import { api } from '../api';

type CreateMode = 'interval' | 'custom';
type BillStatusFilter = '' | 'active' | 'completed' | 'cancelled';
type CustomInstallment = { dueDate: string; amountDue: string; penaltyAmount: string };
type MobileInstallment = { id: string; installment_no: number; due_date: string; amount_due: number; amount_paid?: number; penalty_amount?: number; status: string };
type MobileBillPlan = Omit<BillPlan, 'installments'> & { installments?: MobileInstallment[]; penalty_amount?: number };

const EMPTY_INSTALLMENT: CustomInstallment = { dueDate: '', amountDue: '', penaltyAmount: '' };

const statusTone = (status: string): 'green' | 'red' | 'muted' => status === 'active' || status === 'paid' ? 'green' : status === 'cancelled' || status === 'overdue' ? 'red' : 'muted';

export function BillsScreen() {
  const colors = useColors();
  const qc = useQueryClient();
  const [mode, setMode] = useState<CreateMode>('interval');
  const [customerId, setCustomerId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [lineUserId, setLineUserId] = useState('');
  const [billNo, setBillNo] = useState('');
  const [principal, setPrincipal] = useState('');
  const [installment, setInstallment] = useState('');
  const [cycleDays, setCycleDays] = useState('7');
  const [totalInstallments, setTotalInstallments] = useState('1');
  const [startDate, setStartDate] = useState(todayIso());
  const [bankAccountId, setBankAccountId] = useState('');
  const [billPenalty, setBillPenalty] = useState('');
  const [installmentPenalty, setInstallmentPenalty] = useState('');
  const [note, setNote] = useState('');
  const [customRows, setCustomRows] = useState<CustomInstallment[]>([{ ...EMPTY_INSTALLMENT }]);
  const [formError, setFormError] = useState('');
  const [billFilter, setBillFilter] = useState('');
  const [billStatus, setBillStatus] = useState<BillStatusFilter>('');
  const [expandedPlans, setExpandedPlans] = useState<Record<string, boolean>>({});
  const [previewBill, setPreviewBill] = useState<MobileBillPlan | null>(null);

  const customers = useQuery({ queryKey: ['mobile-customers-for-bills'], queryFn: () => api.get<{ items: Customer[] }>('/api/customers?limit=100&page=1') });
  const banks = useQuery({ queryKey: ['mobile-banks-for-bills'], queryFn: () => api.get<BankAccount[]>('/api/bank-accounts') });
  const bills = useQuery({ queryKey: ['mobile-bills'], queryFn: () => api.get<BillPlan[]>('/api/bill-plans') });
  const preview = useQuery({ queryKey: ['mobile-bill-preview', previewBill?.id], queryFn: () => api.get<{ text: string }>(`/api/bill-plans/${previewBill!.id}/preview`), enabled: Boolean(previewBill) });
  const createInterval = useMutation({ mutationFn: (payload: Record<string, unknown>) => api.post('/api/bill-plans', payload), onSuccess: async () => { resetForm(); await qc.invalidateQueries({ queryKey: ['mobile-bills'] }); Alert.alert('สร้างบิลสำเร็จ', 'ระบบบันทึกแผนการชำระเงินแล้ว'); } });
  const createCustom = useMutation({ mutationFn: (payload: Record<string, unknown>) => api.post('/api/bill-plans/custom-dates', payload), onSuccess: async () => { resetForm(); await qc.invalidateQueries({ queryKey: ['mobile-bills'] }); Alert.alert('สร้างบิลสำเร็จ', 'ระบบบันทึกแผนการชำระเงินแล้ว'); } });
  const linkLine = useMutation({
    mutationFn: () => {
      const value = lineUserId.trim();
      if (!selectedCustomer?.customer_code || !value) throw new Error('กรุณาระบุ LINE User ID');
      return api.post<Customer>('/api/customers/link-line', { customer_code: selectedCustomer.customer_code, line_user_id: value });
    },
    onSuccess: async () => {
      setLineUserId('');
      await qc.invalidateQueries({ queryKey: ['mobile-customers-for-bills'] });
      await qc.invalidateQueries({ queryKey: ['mobile-customers'] });
      await qc.invalidateQueries({ queryKey: ['mobile-bills'] });
    },
  });

  const filteredCustomers = useMemo(() => {
    const query = customerSearch.trim().toLowerCase();
    return (customers.data?.items ?? []).filter((customer) => !query || `${customer.customer_code} ${customer.display_name ?? ''}`.toLowerCase().includes(query));
  }, [customerSearch, customers.data?.items]);
  const filteredBills = useMemo(() => (bills.data ?? []).filter((bill) => (!billFilter.trim() || String(bill.bill_no).includes(billFilter.trim())) && (!billStatus || bill.status === billStatus)), [billFilter, billStatus, bills.data]);
  const groupedBills = useMemo(() => ([['active', 'Active'], ['completed', 'Completed'], ['cancelled', 'Cancelled']] as const).map(([status, label]) => ({ status, label, bills: filteredBills.filter((bill) => bill.status === status) })).filter((group) => group.bills.length > 0), [filteredBills]);
  const selectedCustomer = customers.data?.items.find((customer) => customer.id === customerId);
  const activeBanks = (banks.data ?? []).filter((bank) => bank.is_active);
  const activeCreate = createInterval.isPending || createCustom.isPending;
  const createError = createInterval.error ?? createCustom.error;
  const tabs: Array<{ id: BillStatusFilter; label: string; count: number }> = [
    { id: '', label: 'ทั้งหมด', count: bills.data?.length ?? 0 },
    { id: 'active', label: 'Active', count: (bills.data ?? []).filter((bill) => bill.status === 'active').length },
    { id: 'completed', label: 'Completed', count: (bills.data ?? []).filter((bill) => bill.status === 'completed').length },
    { id: 'cancelled', label: 'Cancelled', count: (bills.data ?? []).filter((bill) => bill.status === 'cancelled').length },
  ];

  function resetForm() {
    setCustomerId(''); setCustomerSearch(''); setBillNo(''); setPrincipal(''); setInstallment(''); setCycleDays('7'); setTotalInstallments('1'); setStartDate(todayIso()); setBankAccountId(''); setBillPenalty(''); setInstallmentPenalty(''); setNote(''); setCustomRows([{ ...EMPTY_INSTALLMENT }]); setFormError(''); setMode('interval');
  }
  function commonPayload() { return { customer_id: customerId, bill_no: Number(billNo), principal_amount: Number(principal), bank_account_id: bankAccountId || undefined, bill_penalty_amount: Number(billPenalty || 0), note: note.trim() || undefined }; }
  function updateRow(index: number, key: keyof CustomInstallment, value: string) { setCustomRows((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row)); }
  function submitInterval() {
    setFormError('');
    if (!customerId || !billNo || !principal || !installment || !cycleDays || !totalInstallments || !startDate) { setFormError('กรุณากรอกข้อมูลที่มีเครื่องหมาย * ให้ครบ'); return; }
    createInterval.mutate({ ...commonPayload(), installment_amount: Number(installment), cycle_type: 'interval_days', cycle_days: Number(cycleDays), total_installments: Number(totalInstallments), start_date: startDate, installment_penalty_amount: Number(installmentPenalty || 0) });
  }
  function submitCustom() {
    setFormError('');
    const rows = customRows.filter((row) => row.dueDate || row.amountDue || row.penaltyAmount);
    if (!customerId || !billNo || !principal) { setFormError('กรุณาเลือกผู้รับบิลและกรอกข้อมูลหลักให้ครบ'); return; }
    if (!rows.length || rows.some((row) => !row.dueDate || !row.amountDue || Number(row.amountDue) <= 0)) { setFormError('กรุณากรอกวันครบกำหนดและยอดของทุกงวดให้ถูกต้อง'); return; }
    createCustom.mutate({ ...commonPayload(), cycle_type: 'custom_dates', installments: rows.map((row, index) => ({ installment_no: index + 1, due_date: row.dueDate, amount_due: Number(row.amountDue), penalty_amount: Number(row.penaltyAmount || 0) })) });
  }
  async function action(id: string, type: 'send' | 'cancel') {
    try { if (type === 'send') await api.post(`/api/bill-plans/${id}/send`); else await api.patch(`/api/bill-plans/${id}/cancel`); await qc.invalidateQueries({ queryKey: ['mobile-bills'] }); Alert.alert('สำเร็จ', type === 'send' ? 'ส่งบิลเข้า LINE แล้ว' : 'ยกเลิกบิลแล้ว'); } catch (err) { Alert.alert('ทำรายการไม่สำเร็จ', err instanceof Error ? err.message : 'กรุณาลองใหม่'); }
  }
  function confirmCancel(id: string) { Alert.alert('ยืนยันยกเลิกบิล', 'งวดที่ยังไม่ชำระจะถูกยกเลิกทั้งหมด', [{ text: 'กลับ' }, { text: 'ยกเลิกบิล', style: 'destructive', onPress: () => void action(id, 'cancel') }]); }

  return <Screen>
    <Header eyebrow="จัดการ" title="สร้างบิล" />
    <Card accent>
      <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '700' }}>สร้างแผนการชำระ</Text>
      <Text style={{ color: colors.muted, fontSize: 13 }}>เลือกวิธีสร้างบิล แล้วกรอกข้อมูลให้ครบก่อนบันทึก</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><Button title="ทุก X วัน" secondary={mode !== 'interval'} onPress={() => { setMode('interval'); setFormError(''); }} /></View><View style={{ flex: 1 }}><Button title="กำหนดวันเอง" secondary={mode !== 'custom'} onPress={() => { setMode('custom'); setFormError(''); }} /></View></View>
      <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '600' }}>ผู้รับบิล *</Text>
      <Field label="ค้นหาลูกค้า" value={customerSearch} onChangeText={setCustomerSearch} placeholder="ค้นหาชื่อหรือรหัสลูกค้า" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">{filteredCustomers.map((customer) => <Pressable key={customer.id} accessibilityRole="button" onPress={() => setCustomerId(customer.id)}><View style={{ minWidth: 150, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: customer.id === customerId ? colors.green : colors.line, backgroundColor: customer.id === customerId ? colors.greenSoft : colors.paper }}><Text style={{ color: colors.ink, fontWeight: '700' }}>{customer.display_name ?? customer.customer_code}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{customer.customer_code} · LINE {customer.line_user_id ? 'ผูกแล้ว' : 'ยังไม่ผูก'}</Text></View></Pressable>)}</ScrollView>
      {selectedCustomer ? <View style={{ gap: 8 }}><Text style={{ color: colors.green, fontSize: 12 }}>เลือกแล้ว · {selectedCustomer.display_name ?? selectedCustomer.customer_code} · LINE {selectedCustomer.line_user_id ? 'ผูกแล้ว' : 'ยังไม่ผูก'}</Text>{selectedCustomer.line_user_id ? <Text style={{ color: colors.muted, fontSize: 12 }}>LINE user ID: {selectedCustomer.line_user_id}</Text> : <View style={{ gap: 8, borderRadius: 12, borderWidth: 1, borderColor: colors.line, padding: 10, backgroundColor: colors.cream }}><Text style={{ color: colors.ink, fontSize: 14, fontWeight: '700' }}>ผูกกับ LINE user ก่อนสร้างบิล</Text><Field label="LINE User ID" value={lineUserId} onChangeText={setLineUserId} placeholder="Uxxxxxxxx" /><Button title={linkLine.isPending ? 'กำลังผูก LINE…' : 'ผูก LINE'} disabled={!lineUserId.trim() || linkLine.isPending} onPress={() => linkLine.mutate()} />{linkLine.error ? <Text style={{ color: colors.red, fontSize: 12 }}>{linkLine.error instanceof Error ? linkLine.error.message : 'ผูก LINE ไม่สำเร็จ'}</Text> : null}</View>}</View> : null}
      <View style={{ flexDirection: 'row', gap: 10 }}><View style={{ flex: 1 }}><Field label="เลขบิล *" value={billNo} onChangeText={setBillNo} placeholder="เช่น 1" keyboardType="numeric" /></View><View style={{ flex: 1 }}><Field label="เงินต้น *" value={principal} onChangeText={setPrincipal} placeholder="10000" keyboardType="numeric" /></View></View>
      {mode === 'interval' ? <><Field label="ส่งงวดละ *" value={installment} onChangeText={setInstallment} placeholder="500" keyboardType="numeric" /><View style={{ flexDirection: 'row', gap: 10 }}><View style={{ flex: 1 }}><Field label="ทุกกี่วัน *" value={cycleDays} onChangeText={setCycleDays} keyboardType="numeric" /></View><View style={{ flex: 1 }}><Field label="จำนวนงวด *" value={totalInstallments} onChangeText={setTotalInstallments} keyboardType="numeric" /></View></View><Field label="วันเริ่ม * (YYYY-MM-DD)" value={startDate} onChangeText={setStartDate} placeholder="2026-08-24" /><Field label="ค่าปรับทุกงวด" value={installmentPenalty} onChangeText={setInstallmentPenalty} placeholder="0" keyboardType="numeric" /></> : <View style={{ gap: 9 }}>{customRows.map((row, index) => <View key={index} style={{ gap: 8, borderRadius: 12, padding: 11, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.cream }}><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: colors.ink, fontWeight: '700' }}>งวดที่ {index + 1}</Text>{customRows.length > 1 ? <Pressable onPress={() => setCustomRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}><Text style={{ color: colors.red, fontSize: 12 }}>ลบงวด</Text></Pressable> : null}</View><Field label="วันครบกำหนด" value={row.dueDate} onChangeText={(value) => updateRow(index, 'dueDate', value)} placeholder="2026-08-31" /><View style={{ flexDirection: 'row', gap: 10 }}><View style={{ flex: 1 }}><Field label="ยอดงวด" value={row.amountDue} onChangeText={(value) => updateRow(index, 'amountDue', value)} placeholder="500" keyboardType="numeric" /></View><View style={{ flex: 1 }}><Field label="ค่าปรับ" value={row.penaltyAmount} onChangeText={(value) => updateRow(index, 'penaltyAmount', value)} placeholder="0" keyboardType="numeric" /></View></View></View>)}<Button title="+ เพิ่มงวด" secondary onPress={() => setCustomRows((rows) => [...rows, { ...EMPTY_INSTALLMENT }])} /></View>}
      <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '600' }}>บัญชีรับโอน</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}><Pressable onPress={() => setBankAccountId('')}><View style={{ minWidth: 145, borderRadius: 11, padding: 10, borderWidth: 1, borderColor: !bankAccountId ? colors.green : colors.line, backgroundColor: !bankAccountId ? colors.greenSoft : colors.paper }}><Text style={{ color: colors.ink, fontWeight: '600' }}>ค่าเริ่มต้น</Text><Text style={{ color: colors.muted, fontSize: 12 }}>ขององค์กร</Text></View></Pressable>{activeBanks.map((bank) => <Pressable key={bank.id} onPress={() => setBankAccountId(bank.id)}><View style={{ minWidth: 145, borderRadius: 11, padding: 10, borderWidth: 1, borderColor: bankAccountId === bank.id ? colors.green : colors.line, backgroundColor: bankAccountId === bank.id ? colors.greenSoft : colors.paper }}><Text style={{ color: colors.ink, fontWeight: '600' }}>{bank.bank_name}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{bank.account_no}</Text></View></Pressable>)}</ScrollView>
      <Field label="ค่าปรับหัวบิลรวม" value={billPenalty} onChangeText={setBillPenalty} placeholder="0" keyboardType="numeric" /><Field label="หมายเหตุ" value={note} onChangeText={setNote} placeholder="รายละเอียดเพิ่มเติม" />
      {formError || createError ? <Text style={{ color: colors.red, fontSize: 13 }}>{formError || (createError instanceof Error ? createError.message : 'สร้างบิลไม่สำเร็จ')}</Text> : null}
      <Button title={activeCreate ? 'กำลังสร้าง…' : 'สร้างบิล'} disabled={activeCreate} onPress={mode === 'interval' ? submitInterval : submitCustom} />
    </Card>
    <View style={{ gap: 10 }}><View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}><View><Text style={{ color: colors.ink, fontSize: 18, fontWeight: '700' }}>บิลทั้งหมด</Text><Text style={{ color: colors.muted, fontSize: 12 }}>ค้นหาและจัดการบิลที่สร้างไว้</Text></View><Text style={{ color: colors.muted, fontSize: 12 }}>{filteredBills.length} บิล</Text></View><Field label="ค้นหาเลขที่บิล" value={billFilter} onChangeText={setBillFilter} placeholder="เช่น 1001" keyboardType="numeric" /><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>{tabs.map((tab) => <Pressable key={tab.id || 'all'} onPress={() => setBillStatus(tab.id)}><View style={{ borderRadius: 999, paddingHorizontal: 13, paddingVertical: 9, borderWidth: 1, borderColor: billStatus === tab.id ? colors.navy : colors.line, backgroundColor: billStatus === tab.id ? colors.navy : colors.paper }}><Text style={{ color: billStatus === tab.id ? '#fff' : colors.muted, fontSize: 12, fontWeight: '600' }}>{tab.label} · {tab.count}</Text></View></Pressable>)}</ScrollView>{bills.isLoading ? <Text style={{ color: colors.muted, textAlign: 'center', padding: 24 }}>กำลังโหลดบิล…</Text> : null}{groupedBills.map((group) => <View key={group.status} style={{ gap: 8 }}><Text style={{ color: colors.ink, fontSize: 14, fontWeight: '700' }}>บิล {group.label}</Text>{group.bills.map((rawBill) => { const bill = rawBill as MobileBillPlan; const expanded = expandedPlans[bill.id] ?? true; return <Card key={bill.id}><View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}><View style={{ flex: 1, gap: 3 }}><Text style={{ color: colors.ink, fontSize: 16, fontWeight: '700' }}>บิล {bill.bill_no}</Text><Text style={{ color: colors.muted, fontSize: 13 }}>{bill.customer?.display_name ?? bill.customer?.customer_code ?? 'ไม่ระบุลูกค้า'} · LINE {bill.customer?.line_user_id ? 'ผูกแล้ว' : 'ยังไม่ผูก'}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{formatBaht(bill.principal_amount)} · {bill.total_installments} งวด</Text></View><Badge tone={statusTone(bill.status)}>{statusLabel(bill.status)}</Badge></View><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}><Button title={expanded ? 'ย่อ' : 'ดูงวด'} secondary onPress={() => setExpandedPlans((current) => ({ ...current, [bill.id]: !expanded }))} /><Button title="Preview" secondary onPress={() => setPreviewBill(bill)} />{bill.status === 'active' ? <Button title="ส่ง LINE" secondary onPress={() => void action(bill.id, 'send')} /> : null}{bill.status === 'active' ? <Button title="ยกเลิก" secondary onPress={() => confirmCancel(bill.id)} /> : null}</View>{expanded ? <View style={{ gap: 7, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 9 }}>{(bill.installments ?? []).map((item) => <View key={item.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}><View style={{ flex: 1 }}><Text style={{ color: colors.ink, fontSize: 13, fontWeight: '600' }}>งวด {item.installment_no} · {formatDate(item.due_date)}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>ค้าง {formatBaht(Number(item.amount_due) - Number(item.amount_paid ?? 0))}</Text></View><Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge></View>)}{!bill.installments?.length ? <Text style={{ color: colors.muted, fontSize: 12 }}>ไม่มีข้อมูลงวด</Text> : null}</View> : null}</Card>; })}</View>)}{!bills.isLoading && !bills.error && filteredBills.length === 0 ? <Text style={{ color: colors.muted, textAlign: 'center', padding: 24 }}>ยังไม่มีบิล</Text> : null}</View>
    <Modal visible={Boolean(previewBill)} transparent animationType="slide" onRequestClose={() => setPreviewBill(null)}><View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.45)' }}><View style={{ maxHeight: '82%', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 12, backgroundColor: colors.paper }}><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: colors.ink, fontSize: 18, fontWeight: '700' }}>Preview Bill {previewBill?.bill_no ?? ''}</Text><Pressable onPress={() => setPreviewBill(null)}><Text style={{ color: colors.muted }}>ปิด</Text></Pressable></View>{preview.isLoading ? <Text style={{ color: colors.muted }}>กำลังโหลดตัวอย่างบิล…</Text> : null}{preview.error ? <Text style={{ color: colors.red }}>โหลด Preview ไม่สำเร็จ</Text> : null}{preview.data?.text ? <ScrollView style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.cream }} contentContainerStyle={{ padding: 14 }}><Text selectable style={{ color: colors.ink, fontSize: 15, lineHeight: 24 }}>{preview.data.text}</Text></ScrollView> : null}</View></View></Modal>
  </Screen>;
}
