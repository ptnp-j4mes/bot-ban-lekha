import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { font, palette } from '../../../../shared/src/theme';
import { useAdminAuth } from '../auth';

const light = {
  background: '#F8FAFC',
  foreground: '#0F172A',
  primary: '#0F172A',
  outline: '#0F172A',
  primaryForeground: '#FFFFFF',
  positive: '#059669',
  border: '#E2E8F0',
  muted: '#475569',
  input: '#FFFFFF',
};

const dark = {
  background: '#0B1120',
  foreground: '#F1F5F9',
  primary: '#18C38A',
  outline: '#F1F5F9',
  primaryForeground: '#FFFFFF',
  positive: '#18C38A',
  border: '#334157',
  muted: '#A3B0C2',
  input: '#141C2E',
};

function LedgerCover() {
  return (
    <View style={styles.cover}>
      <View>
        <Text style={[styles.coverEyebrow, { color: `${palette.green}99` }]}>สมุดลูกหนี้</Text>
        <Text style={[styles.coverBrand, { color: '#FFFFFF' }]}>Bill Admin</Text>
      </View>

      <View>
        <Text style={[styles.coverTitle, { color: `${palette.greenSoft}E6` }]}>ทวงบิลผ่าน LINE{`\n`}รับสลิป · กระทบยอดอัตโนมัติ</Text>
        <View style={styles.coverFacts}>
          <View style={[styles.coverFact, { borderBottomColor: '#FFFFFF1A' }]}> 
            <Text style={[styles.coverFactText, { color: `${palette.greenSoft}66` }]}>ส่งเตือนตามรอบงวด</Text>
            <Text style={[styles.coverFactText, { color: `${palette.greenSoft}66` }]}>LINE OA</Text>
          </View>
          <View style={[styles.coverFact, { borderBottomColor: '#FFFFFF1A' }]}> 
            <Text style={[styles.coverFactText, { color: `${palette.greenSoft}66` }]}>อ่านสลิป OCR</Text>
            <Text style={[styles.coverFactText, { color: `${palette.greenSoft}66` }]}>ตรวจก่อนอนุมัติ</Text>
          </View>
          <View style={styles.coverFact}>
            <Text style={[styles.coverFactText, { color: `${palette.greenSoft}66` }]}>กระทบยอดเข้าบิล</Text>
            <Text style={[styles.coverFactText, { color: `${palette.greenSoft}66` }]}>อัตโนมัติ</Text>
          </View>
        </View>
      </View>

      <Text style={[styles.coverFooter, { color: `${palette.greenSoft}40` }]}>© {new Date().getFullYear() + 543} BILL ADMIN</Text>
    </View>
  );
}

export function LoginScreen() {
  const { width } = useWindowDimensions();
  const isDark = useColorScheme() === 'dark';
  const colors = isDark ? dark : light;
  const isWide = width >= 900;
  const { login, loginWithLine } = useAdminAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [focusedField, setFocusedField] = useState<'username' | 'password' | null>(null);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (err) {
      Alert.alert('เข้าสู่ระบบไม่สำเร็จ', err instanceof Error ? err.message : 'กรุณาลองใหม่');
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = Boolean(username.trim() && password) && !busy;

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['top', 'right', 'bottom', 'left']}>
        <View style={[styles.layout, isWide && styles.layoutWide]}>
          {isWide ? <LedgerCover /> : null}

          <ScrollView
            style={styles.formPane}
            contentContainerStyle={[styles.formScroll, isWide && styles.formScrollWide]}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.formContent}>
              <Text style={[styles.formEyebrow, { color: colors.muted }]}>เข้าสู่ระบบ</Text>
              <Text style={[styles.formTitle, { color: colors.foreground }]}>ลงชื่อเข้าใช้บัญชี</Text>

              <View style={styles.form}>
                <View style={styles.field}>
                  <Text style={[styles.label, { color: colors.muted }]}>Username</Text>
                  <TextInput
                    accessibilityLabel="Username"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoFocus={!isWide}
                    onBlur={() => setFocusedField(null)}
                    onChangeText={setUsername}
                    onFocus={() => setFocusedField('username')}
                    returnKeyType="next"
                    style={[
                      styles.input,
                      { backgroundColor: colors.input, borderColor: focusedField === 'username' ? colors.primary : colors.border, color: colors.foreground },
                    ]}
                    textContentType="username"
                    value={username}
                  />
                </View>

                <View style={styles.field}>
                  <Text style={[styles.label, { color: colors.muted }]}>Password</Text>
                  <TextInput
                    accessibilityLabel="Password"
                    autoCapitalize="none"
                    autoCorrect={false}
                    onBlur={() => setFocusedField(null)}
                    onChangeText={setPassword}
                    onFocus={() => setFocusedField('password')}
                    returnKeyType="go"
                    secureTextEntry
                    style={[
                      styles.input,
                      { backgroundColor: colors.input, borderColor: focusedField === 'password' ? colors.primary : colors.border, color: colors.foreground },
                    ]}
                    textContentType="password"
                    value={password}
                  />
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !canSubmit }}
                  disabled={!canSubmit}
                  onPress={() => void run(() => login(username.trim(), password))}
                  style={({ pressed }) => [
                    styles.button,
                    { backgroundColor: colors.primary, borderColor: colors.primary, opacity: !canSubmit ? 0.4 : pressed ? 0.86 : 1 },
                  ]}
                >
                  <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>{busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}</Text>
                </Pressable>

                <View style={styles.divider}>
                  <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                  <Text style={[styles.dividerText, { color: colors.muted }]}>หรือ</Text>
                  <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: busy }}
                  disabled={busy}
                  onPress={() => void run(loginWithLine)}
                  style={({ pressed }) => [styles.button, styles.outlineButton, { borderColor: colors.outline, opacity: busy ? 0.4 : pressed ? 0.72 : 1 }]}
                >
                  <Text style={[styles.buttonText, { color: colors.foreground }]}>เข้าสู่ระบบด้วย LINE</Text>
                </Pressable>
              </View>

              <Text style={[styles.helper, { color: colors.muted }]}>ใช้บัญชี admin เดิมของระบบเว็บได้ ข้อมูลบัญชีและ token จะถูกเก็บใน iOS Keychain</Text>
            </View>
          </ScrollView>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  layout: { flex: 1 },
  layoutWide: { flexDirection: 'row' },
  cover: { width: '42%', backgroundColor: palette.navy, justifyContent: 'space-between', padding: 48 },
  coverEyebrow: { fontFamily: font('sans', 'medium'), fontSize: 11, letterSpacing: 2.75, textTransform: 'uppercase' },
  coverBrand: { fontFamily: font('heading', 'bold'), fontSize: 24, fontWeight: '700', letterSpacing: -0.5, marginTop: 4 },
  coverTitle: { fontFamily: font('heading', 'bold'), fontSize: 28, fontWeight: '700', lineHeight: 36 },
  coverFacts: { marginTop: 24 },
  coverFact: { borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 6, paddingTop: 6 },
  coverFactText: { fontFamily: font('mono'), fontSize: 12 },
  coverFooter: { fontFamily: font('mono'), fontSize: 10, letterSpacing: 1.2 },
  formPane: { flex: 1 },
  formScroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  formScrollWide: { paddingHorizontal: 24 },
  formContent: { alignSelf: 'center', width: '100%', maxWidth: 340 },
  formEyebrow: { fontFamily: font('latin', 'bold'), fontSize: 10, letterSpacing: 1.8, textTransform: 'uppercase' },
  formTitle: { fontFamily: font('heading', 'bold'), fontSize: 20, fontWeight: '700', letterSpacing: -0.35, marginTop: 4 },
  form: { gap: 12, marginTop: 28 },
  field: { gap: 4 },
  label: { fontFamily: font('latin', 'medium'), fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase' },
  input: { borderRadius: 8, borderWidth: 1, fontFamily: font('sans'), fontSize: 14, height: 40, paddingHorizontal: 14 },
  button: { alignItems: 'center', borderRadius: 8, borderWidth: 1, height: 40, justifyContent: 'center', paddingHorizontal: 16 },
  outlineButton: { backgroundColor: 'transparent' },
  buttonText: { fontFamily: font('sans', 'semibold'), fontSize: 14, fontWeight: '600' },
  divider: { alignItems: 'center', flexDirection: 'row', gap: 12, marginVertical: 8 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontFamily: font('sans', 'medium'), fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase' },
  helper: { fontFamily: font('sans'), fontSize: 12, lineHeight: 19, marginTop: 20 },
});
