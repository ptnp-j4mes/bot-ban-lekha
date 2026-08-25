import { useQuery } from '@tanstack/react-query';
import { Text, View } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { Button, Card, Header, Metric, Screen, SectionTitle } from '../../../../shared/src/ui';
import { formatBaht, formatDate } from '../../../../shared/src/format';
import { useColors } from '../../../../shared/src/theme';
import type { CustomerBalance, CustomerInstallment } from '../../../../shared/src/types';
import { api } from '../api';
import { useCustomerAuth } from '../auth';
import type { CustomerStackParamList } from '../navigation';

export function CustomerHomeScreen() {
  const colors = useColors();
  const navigation = useNavigation<NativeStackNavigationProp<CustomerStackParamList>>();
  const { displayName, logout } = useCustomerAuth();
  const balance = useQuery({ queryKey: ['customer-balance'], queryFn: () => api.get<CustomerBalance>('/api/liff/me/balance', { org: false }) });
  const installments = useQuery({ queryKey: ['customer-installments'], queryFn: () => api.get<CustomerInstallment[]>('/api/liff/me/installments', { org: false }) });
  const next = installments.data?.find((item) => item.status !== 'paid');
  return <Screen><Header eyebrow="สวัสดีค่ะ" title={displayName ?? 'ลูกค้า'} right={<Button title="ออก" secondary onPress={() => void logout()} />} /><Metric label="ยอดคงเหลือ" value={formatBaht(balance.data?.outstanding ?? 0)} tone={balance.data?.count ? 'amber' : 'green'} /><Card accent>{balance.data?.count ? <><Text style={{ color: colors.ink, fontSize: 17, fontWeight: '900' }}>มีงวดค้างชำระ {balance.data.count} งวด</Text><Text style={{ color: colors.muted }}>งวดถัดไปจะแสดงด้านล่าง</Text></> : <Text style={{ color: colors.green, fontSize: 16, fontWeight: '900' }}>ไม่มียอดค้างชำระ ✅</Text>}</Card>{next ? <Card><Text style={{ color: colors.muted, fontSize: 12 }}>งวดถัดไป · บิล {next.bill_plan.bill_no} · งวดที่ {next.installment_no}</Text><Text style={{ color: colors.ink, fontSize: 24, fontWeight: '900' }}>{formatBaht(next.amount_due - next.amount_paid)}</Text><Text style={{ color: colors.muted }}>ครบกำหนด {formatDate(next.due_date)}</Text></Card> : null}<SectionTitle>ดูข้อมูลของฉัน</SectionTitle><View style={{ gap: 10 }}><Button title="รายการงวดทั้งหมด" onPress={() => navigation.navigate('Installments')} /><Button title="ประวัติการชำระ" secondary onPress={() => navigation.navigate('Payments')} /></View></Screen>;
}
