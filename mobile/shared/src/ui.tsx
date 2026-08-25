import { Children, createContext, isValidElement, useContext, useState, type PropsWithChildren, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { font, useColors } from './theme';

type HeaderMenuContextValue = {
  onOpenMenu?: () => void;
  notification?: ReactNode;
  profileLabel?: string | null;
  profileInitials?: string;
};

const HeaderMenuContext = createContext<HeaderMenuContextValue>({});
const FLOATING_MENU_INSET = 128;

export function HeaderMenuProvider({ children, value }: PropsWithChildren<{ value: HeaderMenuContextValue }>) {
  return <HeaderMenuContext.Provider value={value}>{children}</HeaderMenuContext.Provider>;
}

export function Screen({ children, scroll = true, backgroundColor, style, stickyHeader }: PropsWithChildren<{ scroll?: boolean; backgroundColor?: string; style?: StyleProp<ViewStyle>; stickyHeader?: ReactNode }>) {
  const colors = useColors();
  const surfaceColor = backgroundColor ?? colors.cream;
  const childArray = Children.toArray(children);
  const autoSticky = !stickyHeader && isValidElement(childArray[0]) && childArray[0].type === Header;
  const hasHeader = Boolean(stickyHeader || autoSticky);
  const content = <View style={[styles.screen, { backgroundColor: surfaceColor }, !scroll && styles.screenNonScroll, style]}>{autoSticky ? childArray.slice(1) : children}</View>;
  const sticky = hasHeader ? <View style={[styles.stickyHeader, { backgroundColor: colors.dashboardSurface, borderBottomColor: colors.dashboardBorder }]}>{stickyHeader ?? <StickyHeader>{childArray[0]}</StickyHeader>}</View> : null;
  if (!scroll) return <SafeAreaView style={[styles.safe, { backgroundColor: surfaceColor }]}>{sticky}{content}</SafeAreaView>;
  return <SafeAreaView style={[styles.safe, { backgroundColor: surfaceColor }]}><ScrollView stickyHeaderIndices={sticky ? [0] : undefined} contentInsetAdjustmentBehavior="never" contentContainerStyle={sticky ? styles.scrollSticky : styles.scroll} keyboardShouldPersistTaps="handled">{sticky}{content}</ScrollView></SafeAreaView>;
}

export function Header({ eyebrow, title, right }: { eyebrow?: string; title: string; right?: ReactNode }) {
  const colors = useColors();
  const { onOpenMenu, notification, profileInitials } = useContext(HeaderMenuContext);
  return (
    <View style={styles.header}>
      <View style={styles.headerStart}>
        {onOpenMenu ? <Pressable accessibilityLabel="เปิดเมนู" accessibilityRole="button" onPress={onOpenMenu} style={({ pressed }) => [styles.menuButton, { borderColor: colors.line, backgroundColor: colors.paper, opacity: pressed ? 0.7 : 1 }]}><Text style={[styles.menuGlyph, { color: colors.ink }]}>☰</Text></Pressable> : null}
        <View style={styles.headerText}>
          {eyebrow ? <Text style={[styles.eyebrow, { color: colors.muted }]}>{eyebrow}</Text> : null}
          <Text style={[styles.title, { color: colors.ink }]}>{title}</Text>
        </View>
      </View>
      <View style={styles.headerRight}>
        {notification}
        {profileInitials ? <View style={[styles.profileMark, { backgroundColor: colors.coralSoft }]}><Text style={[styles.profileText, { color: colors.coralText }]}>{profileInitials}</Text></View> : null}
        {right}
      </View>
    </View>
  );
}

export function StickyHeader({ children }: PropsWithChildren) {
  return <View style={styles.stickyHeaderContent}>{children}</View>;
}

export function Card({ children, accent = false }: PropsWithChildren<{ accent?: boolean }>) {
  const colors = useColors();
  return <View style={[styles.card, { backgroundColor: colors.paper, borderColor: colors.line }, accent && { borderColor: colors.coral, borderWidth: 1.5 }]}>{children}</View>;
}

export function SectionTitle({ children }: PropsWithChildren) {
  const colors = useColors();
  return <Text style={[styles.sectionTitle, { color: colors.ink }]}>{children}</Text>;
}

export function Button({ title, onPress, secondary = false, disabled = false }: { title: string; onPress: () => void; secondary?: boolean; disabled?: boolean }) {
  const colors = useColors();
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, { backgroundColor: secondary ? colors.paper : colors.coral, borderColor: secondary ? colors.navy : colors.coral, opacity: disabled ? 0.4 : pressed ? 0.78 : 1 }]}>
      <Text style={[styles.buttonText, { color: secondary ? colors.ink : '#fff' }]}>{title}</Text>
    </Pressable>
  );
}

export function Field({ label, value, onChangeText, placeholder, secureTextEntry = false, keyboardType }: { label: string; value: string; onChangeText: (value: string) => void; placeholder?: string; secureTextEntry?: boolean; keyboardType?: 'default' | 'numeric' | 'phone-pad' }) {
  const colors = useColors();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} placeholder={placeholder} placeholderTextColor={colors.muted} secureTextEntry={secureTextEntry} keyboardType={keyboardType} style={[styles.input, { color: colors.ink, borderColor: focused ? colors.navy : colors.line, backgroundColor: colors.paper }]} />
    </View>
  );
}

export function Badge({ children, tone = 'muted' }: PropsWithChildren<{ tone?: 'green' | 'red' | 'amber' | 'muted' }>) {
  const colors = useColors();
  const map = { green: [colors.greenSoft, colors.green], red: [colors.redSoft, colors.red], amber: [colors.amberSoft, colors.amber], muted: [colors.cream, colors.muted] } as const;
  const [backgroundColor, color] = map[tone];
  return <View style={[styles.badge, { backgroundColor }]}><Text style={[styles.badgeText, { color }]}>{children}</Text></View>;
}

export function Metric({ label, value, tone = 'green' }: { label: string; value: string; tone?: 'green' | 'red' | 'amber' }) {
  const colors = useColors();
  const color = tone === 'red' ? colors.red : tone === 'amber' ? colors.amber : colors.green;
  return <Card><Text style={[styles.metricLabel, { color: colors.muted }]}>{label}</Text><Text style={[styles.metricValue, { color }]}>{value}</Text></Card>;
}

export function LoadingState({ text = 'กำลังโหลด…' }: { text?: string }) {
  const colors = useColors();
  return <View style={styles.center}><ActivityIndicator color={colors.green} /><Text style={[styles.helper, { color: colors.muted }]}>{text}</Text></View>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const colors = useColors();
  return <Card><Text style={[styles.errorTitle, { color: colors.red }]}>เกิดข้อผิดพลาด</Text><Text style={[styles.helper, { color: colors.muted }]}>{message}</Text>{onRetry ? <Button title="ลองใหม่" onPress={onRetry} secondary /> : null}</Card>;
}

export function EmptyState({ children }: PropsWithChildren) {
  const colors = useColors();
  return <View style={styles.center}><Text style={[styles.helper, { color: colors.muted }]}>{children}</Text></View>;
}

export const styles = StyleSheet.create({
  safe: { flex: 1 },
  screen: { flex: 1, padding: 20, gap: 16 },
  screenNonScroll: { paddingBottom: FLOATING_MENU_INSET },
  scroll: { flexGrow: 1, paddingBottom: FLOATING_MENU_INSET },
  scrollSticky: { paddingBottom: FLOATING_MENU_INSET },
  stickyHeader: { zIndex: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  stickyHeaderContent: { paddingHorizontal: 20, paddingVertical: 10 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 2 },
  headerStart: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  menuButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  menuGlyph: { fontFamily: font('sans'), fontSize: 20, lineHeight: 22 },
  headerText: { flex: 1 },
  eyebrow: { fontFamily: font('sans', 'medium'), fontSize: 10, letterSpacing: 1.6, textTransform: 'uppercase', marginBottom: 4 },
  title: { fontFamily: font('heading', 'bold'), fontSize: 23, fontWeight: '700', letterSpacing: -0.4 },
  sectionTitle: { fontFamily: font('heading', 'bold'), fontSize: 17, fontWeight: '700', marginTop: 4 },
  card: { borderRadius: 20, borderWidth: 1, padding: 16, gap: 9, shadowColor: '#0F172A', shadowOpacity: 0.05, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  button: { minHeight: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  buttonText: { fontFamily: font('sans', 'semibold'), fontSize: 14, fontWeight: '600' },
  field: { gap: 7 },
  label: { fontFamily: font('mono'), fontSize: 11, letterSpacing: 0.6 },
  input: { minHeight: 42, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, fontFamily: font('sans'), fontSize: 14 },
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  badgeText: { fontFamily: font('sans', 'semibold'), fontSize: 11, fontWeight: '600' },
  metricLabel: { fontFamily: font('sans', 'semibold'), fontSize: 12, fontWeight: '600' },
  metricValue: { fontFamily: font('mono', 'bold'), fontSize: 26, fontWeight: '700', letterSpacing: -0.5 },
  helper: { fontFamily: font('sans'), fontSize: 14, lineHeight: 21 },
  errorTitle: { fontFamily: font('sans', 'bold'), fontSize: 16, fontWeight: '700' },
  profileMark: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  profileText: { fontFamily: font('mono', 'bold'), fontSize: 11, fontWeight: '700' },
  center: { minHeight: 130, alignItems: 'center', justifyContent: 'center', gap: 10 },
});
