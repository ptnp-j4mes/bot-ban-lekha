import { useQuery } from '@tanstack/react-query';
import { FlatList, Text, View } from 'react-native';
import { Card, Header, Screen } from '../../../../shared/src/ui';
import { formatBaht, formatDate } from '../../../../shared/src/format';
import { useColors } from '../../../../shared/src/theme';
import type { CustomerPayment } from '../../../../shared/src/types';
import { api } from '../api';

export function PaymentsScreen() {
  const colors = useColors();
  const list = useQuery({ queryKey: ['customer-payments'], queryFn: () => api.get<CustomerPayment[]>('/api/liff/me/payments', { org: false }) });
  return <Screen scroll={false}><Header eyebrow="Bill Customer" title="ประวัติการชำระ" /><FlatList data={list.data ?? []} keyExtractor={(item) => item.id} contentContainerStyle={{ gap: 10, paddingBottom: 30 }} renderItem={({ item }) => <Card><View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}><View style={{ flex: 1, gap: 5 }}><Text style={{ color: colors.ink, fontSize: 16, fontWeight: '900' }}>บิล {item.bill_installment.bill_plan.bill_no} · งวดที่ {item.bill_installment.installment_no}</Text><Text style={{ color: colors.muted }}>{formatDate(item.approved_at)} · {item.payment_method}</Text></View><Text style={{ color: colors.green, fontSize: 16, fontWeight: '900' }}>{formatBaht(item.amount)}</Text></View></Card>} ListEmptyComponent={<Text style={{ color: colors.muted, textAlign: 'center', padding: 24 }}>ยังไม่มีประวัติการชำระ</Text>} /></Screen>;
}
