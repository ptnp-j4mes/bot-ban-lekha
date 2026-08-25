import { useQuery } from '@tanstack/react-query';
import { Text, View } from 'react-native';
import { Button, Card, Header, Screen } from '../../../../shared/src/ui';
import { useColors } from '../../../../shared/src/theme';
import { api } from '../api';
import { useAdminAuth } from '../auth';

export function PlatformScreen() {
  const colors = useColors();
  const { enterOrg } = useAdminAuth();
  const organizations = useQuery({ queryKey: ['mobile-platform-organizations'], queryFn: () => api.get<any>('/api/platform/organizations', { org: false }) });
  const items = Array.isArray(organizations.data) ? organizations.data : organizations.data?.items ?? organizations.data?.organizations ?? [];
  return <Screen><Header eyebrow="Platform Admin" title="เลือกองค์กร" /><Card><Text style={{ color: colors.ink, fontSize: 16, fontWeight: '700' }}>เข้าสู่มุมมองขององค์กร</Text><Text style={{ color: colors.muted, lineHeight: 20 }}>Super Admin ต้องเลือกองค์กรก่อนจึงจะเห็นข้อมูลลูกค้าและบิล</Text></Card>{organizations.isLoading ? <Text style={{ color: colors.muted }}>กำลังโหลดองค์กร…</Text> : null}{organizations.error ? <Text style={{ color: colors.red }}>{organizations.error instanceof Error ? organizations.error.message : 'โหลดองค์กรไม่สำเร็จ'}</Text> : null}<View style={{ gap: 10 }}>{items.map((org: any) => <Card key={org.id}><Text style={{ color: colors.ink, fontSize: 16, fontWeight: '700' }}>{org.name}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{org.id}</Text><Button title="เข้าจัดการ" onPress={() => void enterOrg({ id: org.id, name: org.name })} /></Card>)}</View></Screen>;
}
