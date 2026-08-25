import { useState } from 'react';
import { Alert, FlatList, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, Field, Header, Screen } from '../../../../shared/src/ui';
import { useColors } from '../../../../shared/src/theme';
import type { BankAccount } from '../../../../shared/src/types';
import { api } from '../api';

export function BanksScreen() {
  const colors = useColors();
  const qc = useQueryClient();
  const [accountName, setAccountName] = useState('');
  const [accountNo, setAccountNo] = useState('');
  const [bankName, setBankName] = useState('');
  const accounts = useQuery({ queryKey: ['mobile-banks'], queryFn: () => api.get<BankAccount[]>('/api/bank-accounts') });
  const create = useMutation({ mutationFn: () => api.post('/api/bank-accounts', { account_name: accountName.trim(), account_no: accountNo.trim(), bank_name: bankName.trim(), is_default: (accounts.data?.length ?? 0) === 0 }), onSuccess: async () => { setAccountName(''); setAccountNo(''); setBankName(''); await qc.invalidateQueries({ queryKey: ['mobile-banks'] }); } });
  const mutateAccount = async (id: string, action: 'set-default' | 'deactivate') => {
    try { await api.patch(`/api/bank-accounts/${id}/${action}`); await qc.invalidateQueries({ queryKey: ['mobile-banks'] }); } catch (err) { Alert.alert('ทำรายการไม่สำเร็จ', err instanceof Error ? err.message : 'กรุณาลองใหม่'); }
  };
  return <Screen scroll={false}><Header eyebrow="จัดการ" title="บัญชีรับโอน" /><Card><Text style={{ color: colors.ink, fontSize: 17, fontWeight: '700' }}>เพิ่มบัญชี</Text><Field label="ชื่อบัญชี *" value={accountName} onChangeText={setAccountName} placeholder="ชื่อเจ้าของบัญชี" /><Field label="เลขบัญชี *" value={accountNo} onChangeText={setAccountNo} placeholder="เลขที่บัญชี" keyboardType="numeric" /><Field label="ธนาคาร *" value={bankName} onChangeText={setBankName} placeholder="ชื่อธนาคาร" /><Button title={create.isPending ? 'กำลังบันทึก…' : 'บันทึกบัญชี'} disabled={!accountName || !accountNo || !bankName || create.isPending} onPress={() => create.mutate()} /></Card><FlatList data={accounts.data ?? []} keyExtractor={(item) => item.id} contentContainerStyle={{ gap: 10, paddingBottom: 30 }} renderItem={({ item }) => <Card><View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}><View style={{ flex: 1, gap: 4 }}><Text style={{ color: colors.ink, fontSize: 16, fontWeight: '700' }}>{item.account_name}</Text><Text style={{ color: colors.muted }}>{item.bank_name} · {item.account_no}</Text></View><Badge tone={item.is_active ? 'green' : 'muted'}>{item.is_default ? 'ค่าเริ่มต้น' : item.is_active ? 'ใช้งาน' : 'ปิดใช้งาน'}</Badge></View><View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><Button title="ตั้งค่าเริ่มต้น" secondary disabled={item.is_default || !item.is_active} onPress={() => void mutateAccount(item.id, 'set-default')} /></View><View style={{ flex: 1 }}><Button title="ปิดใช้งาน" secondary disabled={!item.is_active || item.is_default} onPress={() => void mutateAccount(item.id, 'deactivate')} /></View></View></Card>} ListEmptyComponent={<Text style={{ color: colors.muted, textAlign: 'center', padding: 24 }}>ยังไม่มีบัญชีรับโอน</Text>} /></Screen>;
}
