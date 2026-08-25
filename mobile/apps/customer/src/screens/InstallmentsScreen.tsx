import { useQuery } from '@tanstack/react-query';
import { FlatList, Text, View } from 'react-native';
import { Badge, Card, Header, Screen } from '../../../../shared/src/ui';
import { formatBaht, formatDate, statusLabel } from '../../../../shared/src/format';
import { useColors } from '../../../../shared/src/theme';
import type { CustomerInstallment } from '../../../../shared/src/types';
import { api } from '../api';

export function InstallmentsScreen() {
  const colors = useColors();
  const list = useQuery({ queryKey: ['customer-installments'], queryFn: () => api.get<CustomerInstallment[]>('/api/liff/me/installments', { org: false }) });
  return <Screen scroll={false}><Header eyebrow="Bill Customer" title="รายการงวดทั้งหมด" /><FlatList data={list.data ?? []} keyExtractor={(item) => item.id} contentContainerStyle={{ gap: 10, paddingBottom: 30 }} renderItem={({ item }) => <Card><View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}><View style={{ flex: 1, gap: 5 }}><Text style={{ color: colors.ink, fontSize: 16, fontWeight: '900' }}>บิล {item.bill_plan.bill_no} · งวดที่ {item.installment_no}</Text><Text style={{ color: colors.muted }}>ครบกำหนด {formatDate(item.due_date)}</Text><Text style={{ color: colors.ink, fontSize: 16, fontWeight: '800' }}>{formatBaht(item.amount_due - item.amount_paid)}</Text></View><Badge tone={item.status === 'paid' ? 'green' : item.status === 'overdue' ? 'red' : 'amber'}>{statusLabel(item.status)}</Badge></View></Card>} ListEmptyComponent={<Text style={{ color: colors.muted, textAlign: 'center', padding: 24 }}>ยังไม่มีรายการงวด</Text>} /></Screen>;
}
