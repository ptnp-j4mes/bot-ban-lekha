import { Alert, FlatList, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, Header, Screen } from '../../../../shared/src/ui';
import { formatBaht, formatDate, statusLabel } from '../../../../shared/src/format';
import { useColors } from '../../../../shared/src/theme';
import type { PaymentSubmission } from '../../../../shared/src/types';
import { api } from '../api';

export function SubmissionsScreen() {
  const colors = useColors();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['mobile-submissions'], queryFn: () => api.get<{ items: PaymentSubmission[]; total: number }>('/api/admin/payment-submissions?review_status=pending_review&limit=50') });
  const approve = useMutation({ mutationFn: (id: string) => api.post(`/api/admin/payment-submissions/${id}/approve`), onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['mobile-submissions'] }); } });
  const reject = useMutation({ mutationFn: (id: string) => api.post(`/api/admin/payment-submissions/${id}/reject`, { reason: 'ปฏิเสธจาก mobile admin' }), onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['mobile-submissions'] }); } });
  const run = (kind: 'approve' | 'reject', id: string) => Alert.alert(kind === 'approve' ? 'ยืนยันการอนุมัติ' : 'ยืนยันการปฏิเสธ', kind === 'approve' ? 'ระบบจะบันทึกการชำระเงินและอัปเดตงวด' : 'สลิปจะถูกปฏิเสธ', [{ text: 'ยกเลิก' }, { text: 'ยืนยัน', onPress: () => (kind === 'approve' ? approve.mutate(id) : reject.mutate(id)) }]);
  return <Screen scroll={false}><Header eyebrow="จัดการ" title={`สลิป / อนุมัติ (${list.data?.total ?? 0})`} /><FlatList data={list.data?.items ?? []} keyExtractor={(item) => item.id} contentContainerStyle={{ gap: 10, paddingBottom: 30 }} renderItem={({ item }) => <Card><View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}><View style={{ flex: 1, gap: 5 }}><Text style={{ color: colors.ink, fontSize: 16, fontWeight: '700' }}>{item.customer?.display_name ?? item.customer?.customer_code ?? 'สลิปกลุ่ม'}</Text><Text style={{ color: colors.muted }}>{item.parsed_amount ? formatBaht(item.parsed_amount) : 'ไม่พบยอด'} · {formatDate(item.parsed_transfer_date)}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>OCR: {statusLabel(item.ocr_status)} · match: {statusLabel(item.match_status)}</Text></View><Badge tone="amber">{statusLabel(item.review_status)}</Badge></View><View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><Button title="อนุมัติ" onPress={() => run('approve', item.id)} /></View><View style={{ flex: 1 }}><Button title="ปฏิเสธ" secondary onPress={() => run('reject', item.id)} /></View></View></Card>} ListEmptyComponent={<Text style={{ color: colors.muted, textAlign: 'center', padding: 24 }}>ไม่มีสลิปรอตรวจ</Text>} /></Screen>;
}
