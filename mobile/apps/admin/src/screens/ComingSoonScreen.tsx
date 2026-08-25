import { Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Card, Header, Screen } from '../../../../shared/src/ui';
import { useColors } from '../../../../shared/src/theme';
import type { AdminStackParamList } from '../navigation';

type Props = NativeStackScreenProps<AdminStackParamList, 'ComingSoon'>;

export function ComingSoonScreen({ route }: Props) {
  const colors = useColors();
  return <Screen><Header eyebrow="Bill Admin" title={route.params.title} /><Card><Text style={{ color: colors.ink, fontSize: 17, fontWeight: '700' }}>กำลังเตรียมหน้าจอ native</Text><Text style={{ color: colors.muted, fontSize: 14, lineHeight: 21 }}>{route.params.description}</Text></Card></Screen>;
}
