import { useState } from 'react';
import { FlatList, Modal, Pressable, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { Badge, Button, Card, Field, Header, Screen } from '../../../../shared/src/ui';
import { formatBaht, formatDate, statusLabel } from '../../../../shared/src/format';
import { useColors } from '../../../../shared/src/theme';
import type { Customer } from '../../../../shared/src/types';
import { api } from '../api';
import type { AdminStackParamList } from '../navigation';

type CustomerBill = {
  id: string;
  bill_no: number;
  principal_amount: number;
  installment_amount: number;
  total_installments: number;
  status: string;
  installments?: Array<{ id: string; installment_no: number; due_date: string; amount_due: number; amount_paid?: number; penalty_amount?: number; status: string }>;
  bank_account?: { bank_name: string; account_no: string } | null;
};

const billStatusTone = (status: string): 'green' | 'red' | 'muted' => status === 'active' || status === 'paid' ? 'green' : status === 'cancelled' || status === 'overdue' ? 'red' : 'muted';

export function CustomersScreen() {
  const colors = useColors();
  const navigation = useNavigation<NativeStackNavigationProp<AdminStackParamList>>();
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const customers = useQuery({ queryKey: ['mobile-customers'], queryFn: () => api.get<{ items: Customer[]; total: number }>('/api/customers?limit=50&page=1') });
  const create = useMutation({ mutationFn: () => api.post('/api/customers', { customer_code: code.trim(), display_name: name.trim() || undefined, phone: phone.trim() || undefined }), onSuccess: async () => { setCode(''); setName(''); setPhone(''); await qc.invalidateQueries({ queryKey: ['mobile-customers'] }); } });

  return (
    <Screen scroll={false}>
      <Header eyebrow="จัดการ" title="ลูกค้า" />
      <Card>
        <Text style={{ color: colors.ink, fontSize: 17, fontWeight: '700' }}>เพิ่มลูกค้า</Text>
        <Field label="รหัสลูกค้า *" value={code} onChangeText={setCode} placeholder="เช่น C0001" />
        <Field label="ชื่อแสดงผล" value={name} onChangeText={setName} placeholder="ชื่อลูกค้า" />
        <Field label="เบอร์โทรศัพท์" value={phone} onChangeText={setPhone} placeholder="08xxxxxxxx" keyboardType="phone-pad" />
        <Button title={create.isPending ? 'กำลังบันทึก…' : 'บันทึกลูกค้า'} disabled={!code.trim() || create.isPending} onPress={() => create.mutate()} />
      </Card>
      {customers.isLoading ? <Text style={{ color: colors.muted }}>กำลังโหลดลูกค้า…</Text> : null}
      {customers.error ? <Text style={{ color: colors.red }}>{customers.error instanceof Error ? customers.error.message : 'โหลดข้อมูลไม่สำเร็จ'}</Text> : null}
      <FlatList
        data={customers.data?.items ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ gap: 10, paddingBottom: 30 }}
        renderItem={({ item }) => (
          <Pressable onPress={() => navigation.navigate('CustomerDetail', { id: item.id, name: item.display_name ?? item.customer_code })}>
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                <View style={{ flex: 1, gap: 5 }}><Text style={{ color: colors.ink, fontSize: 16, fontWeight: '700' }}>{item.display_name ?? item.customer_code}</Text><Text style={{ color: colors.muted, fontSize: 13 }}>{item.customer_code} · {item.phone || 'ไม่มีเบอร์โทร'} · LINE {item.line_user_id ? 'ผูกแล้ว' : 'ยังไม่ผูก'}</Text></View>
                <Badge tone={item.status === 'active' ? 'green' : 'muted'}>{item.status === 'active' ? 'ใช้งาน' : item.status}</Badge>
              </View>
            </Card>
          </Pressable>
        )}
        ListEmptyComponent={<Text style={{ color: colors.muted, textAlign: 'center', padding: 24 }}>ยังไม่มีลูกค้า</Text>}
      />
      {create.error ? <Text style={{ color: colors.red }}>{create.error instanceof Error ? create.error.message : 'บันทึกไม่สำเร็จ'}</Text> : null}
    </Screen>
  );
}

export function CustomerDetailScreen({ route }: { route: { params: { id: string; name: string } } }) {
  const colors = useColors();
  const qc = useQueryClient();
  const [lineUserId, setLineUserId] = useState('');
  const [selectedBill, setSelectedBill] = useState<CustomerBill | null>(null);
  const detail = useQuery({ queryKey: ['mobile-customer-detail', route.params.id], queryFn: () => api.get<any>(`/api/customers/${route.params.id}/detail`) });
  const linkLine = useMutation({
    mutationFn: () => {
      const customerCode = String(detail.data?.customer?.customer_code ?? '');
      const value = lineUserId.trim();
      if (!customerCode || !value) throw new Error('กรุณาระบุ LINE User ID');
      return api.post<Customer>('/api/customers/link-line', { customer_code: customerCode, line_user_id: value });
    },
    onSuccess: async () => {
      setLineUserId('');
      await qc.invalidateQueries({ queryKey: ['mobile-customer-detail', route.params.id] });
      await qc.invalidateQueries({ queryKey: ['mobile-customers'] });
    },
  });
  if (detail.isLoading) return <Screen><Header eyebrow="ลูกค้า" title={route.params.name} /><Text style={{ color: colors.muted }}>กำลังโหลดรายละเอียด…</Text></Screen>;
  if (detail.error) return <Screen><Header eyebrow="ลูกค้า" title={route.params.name} /><Text style={{ color: colors.red }}>{detail.error instanceof Error ? detail.error.message : 'โหลดข้อมูลไม่สำเร็จ'}</Text></Screen>;
  const data = detail.data;
  return <>
    <Screen><Header eyebrow="ลูกค้า" title={data.customer?.display_name ?? route.params.name} /><Card><Text style={{ color: colors.ink, fontSize: 16, fontWeight: '700' }}>{data.customer?.customer_code}</Text><Text style={{ color: colors.muted }}>{data.customer?.phone || 'ไม่มีเบอร์โทร'} · LINE {data.customer?.line_user_id ? 'ผูกแล้ว' : 'ยังไม่ผูก'}</Text>{data.customer?.line_user_id ? <Text style={{ color: colors.muted, fontSize: 12, marginTop: 6 }}>LINE user ID: {data.customer.line_user_id}</Text> : null}</Card>{data.customer?.line_user_id ? null : <Card><Text style={{ color: colors.ink, fontSize: 16, fontWeight: '700' }}>ผูกกับ LINE user</Text><Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>กรอก LINE User ID ของลูกค้ารายนี้ เช่น Uxxxxxxxx</Text><Field label="LINE User ID" value={lineUserId} onChangeText={setLineUserId} placeholder="Uxxxxxxxx" /><Button title={linkLine.isPending ? 'กำลังผูก LINE…' : 'ผูก LINE'} disabled={!lineUserId.trim() || linkLine.isPending} onPress={() => linkLine.mutate()} />{linkLine.error ? <Text style={{ color: colors.red, marginTop: 8 }}>{linkLine.error instanceof Error ? linkLine.error.message : 'ผูก LINE ไม่สำเร็จ'}</Text> : null}</Card>}<Text style={{ color: colors.ink, fontSize: 18, fontWeight: '700' }}>บิล ({data.bill_plans?.length ?? 0})</Text>{(data.bill_plans ?? []).map((bill: CustomerBill) => <Pressable key={bill.id} accessibilityRole="button" accessibilityLabel={`เปิดรายละเอียดบิล ${bill.bill_no}`} onPress={() => setSelectedBill(bill)}><Card><Text style={{ color: colors.ink, fontWeight: '700' }}>บิล {bill.bill_no}</Text><Text style={{ color: colors.muted }}>{bill.installments?.length ?? 0} งวด · {statusLabel(bill.status)}</Text></Card></Pressable>)}</Screen>
    <Modal visible={Boolean(selectedBill)} animationType="slide" onRequestClose={() => setSelectedBill(null)}>
      {selectedBill ? <Screen><Header eyebrow="รายละเอียดบิล" title={`บิล ${selectedBill.bill_no}`} right={<Pressable accessibilityRole="button" accessibilityLabel="ปิดรายละเอียดบิล" onPress={() => setSelectedBill(null)}><Text style={{ color: colors.navy, fontWeight: '700' }}>ปิด</Text></Pressable>} /><Card accent><View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}><Text style={{ color: colors.ink, fontSize: 17, fontWeight: '700' }}>สถานะบิล</Text><Badge tone={billStatusTone(selectedBill.status)}>{statusLabel(selectedBill.status)}</Badge></View><Text style={{ color: colors.muted }}>ลูกค้า: {data.customer?.display_name ?? data.customer?.customer_code ?? route.params.name}</Text></Card><Text style={{ color: colors.ink, fontSize: 18, fontWeight: '700' }}>สรุปบิล</Text><Card><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: colors.muted }}>เงินต้น</Text><Text style={{ color: colors.ink, fontWeight: '700' }}>{formatBaht(selectedBill.principal_amount)}</Text></View><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: colors.muted }}>ยอดต่องวด</Text><Text style={{ color: colors.ink, fontWeight: '700' }}>{formatBaht(selectedBill.installment_amount)}</Text></View><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: colors.muted }}>จำนวนงวด</Text><Text style={{ color: colors.ink, fontWeight: '700' }}>{selectedBill.total_installments} งวด</Text></View>{selectedBill.bank_account ? <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}><Text style={{ color: colors.muted }}>บัญชีรับโอน</Text><Text style={{ color: colors.ink, fontWeight: '700', flex: 1, textAlign: 'right' }}>{selectedBill.bank_account.bank_name} · {selectedBill.bank_account.account_no}</Text></View> : null}</Card><Text style={{ color: colors.ink, fontSize: 18, fontWeight: '700' }}>รายการงวด ({selectedBill.installments?.length ?? 0})</Text>{(selectedBill.installments ?? []).map((item) => <Card key={item.id}><View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}><Text style={{ color: colors.ink, fontWeight: '700' }}>งวดที่ {item.installment_no}</Text><Badge tone={billStatusTone(item.status)}>{statusLabel(item.status)}</Badge></View><Text style={{ color: colors.muted }}>ครบกำหนด {formatDate(item.due_date)}</Text><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: colors.muted }}>ยอดงวด</Text><Text style={{ color: colors.ink, fontWeight: '700' }}>{formatBaht(item.amount_due)}</Text></View><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: colors.muted }}>ชำระแล้ว</Text><Text style={{ color: colors.green, fontWeight: '700' }}>{formatBaht(item.amount_paid ?? 0)}</Text></View><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: colors.muted }}>คงเหลือ</Text><Text style={{ color: colors.ink, fontWeight: '700' }}>{formatBaht(Number(item.amount_due) - Number(item.amount_paid ?? 0))}</Text></View></Card>)}<Button title="ปิดรายละเอียด" secondary onPress={() => setSelectedBill(null)} /></Screen> : null}
    </Modal>
  </>;
}
