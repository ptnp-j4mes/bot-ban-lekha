import { Text, View } from 'react-native';
import { Button, Card, Screen } from '../../../../shared/src/ui';
import { useColors } from '../../../../shared/src/theme';
import { useAdminAuth } from '../auth';

export function PendingApprovalScreen() {
  const colors = useColors();
  const { logout } = useAdminAuth();
  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', paddingVertical: 80 }}>
        <Card accent>
          <Text style={{ color: colors.ink, fontFamily: 'PlusJakartaSans-Bold', fontSize: 21, fontWeight: '700' }}>รออนุมัติสิทธิ์เข้าใช้งาน</Text>
          <Text style={{ color: colors.muted, fontFamily: 'NotoSansThai-Regular', fontSize: 14, lineHeight: 22 }}>บัญชี LINE นี้เข้าสู่ระบบแล้ว กรุณารอ Super Admin กำหนดองค์กรและเมนูที่อนุญาตให้ใช้งาน</Text>
          <Button title="ออกจากระบบ" onPress={() => void logout()} secondary />
        </Card>
      </View>
    </Screen>
  );
}
