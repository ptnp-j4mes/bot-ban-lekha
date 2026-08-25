import { useEffect, useRef } from 'react';
import { createNavigationContainerRef, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar, Text, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Screen } from '../../shared/src/ui';
import { useColors } from '../../shared/src/theme';
import { AdminAuthProvider, useAdminAuth } from './src/auth';
import type { AdminStackParamList } from './src/navigation';
import { LoginScreen } from './src/screens/LoginScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { CustomersScreen, CustomerDetailScreen } from './src/screens/CustomersScreen';
import { BillsScreen } from './src/screens/BillsScreen';
import { BanksScreen } from './src/screens/BanksScreen';
import { SubmissionsScreen } from './src/screens/SubmissionsScreen';
import { PlatformScreen } from './src/screens/PlatformScreen';
import { ComingSoonScreen } from './src/screens/ComingSoonScreen';
import { ChatCloneScreen, GroupsScreen, LineOaScreen, LogsScreen, MessageResponseSettingsScreen, ReportsScreen, SendersScreen, SettingsScreen } from './src/screens/AdminWebScreens';
import { AdminMenuProvider } from './src/components/AdminMenu';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 20_000 } } });
const Stack = createNativeStackNavigator<AdminStackParamList>();

function AdminNavigator({ profileLabel, onLogout }: { profileLabel?: string | null; onLogout: () => void }) {
  const navigationRef = useRef(createNavigationContainerRef<AdminStackParamList>()).current;
  return <NavigationContainer ref={navigationRef}><AdminMenuProvider mode="org" profileLabel={profileLabel} onLogout={onLogout} navigationRef={navigationRef}><Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}><Stack.Screen name="Dashboard" component={DashboardScreen} /><Stack.Screen name="Customers" component={CustomersScreen} /><Stack.Screen name="CustomerDetail" component={CustomerDetailScreen} /><Stack.Screen name="Bills" component={BillsScreen} /><Stack.Screen name="Banks" component={BanksScreen} /><Stack.Screen name="Submissions" component={SubmissionsScreen} /><Stack.Screen name="Reports" component={ReportsScreen} /><Stack.Screen name="LineOa" component={LineOaScreen} /><Stack.Screen name="ChatClone" component={ChatCloneScreen} /><Stack.Screen name="Senders" component={SendersScreen} /><Stack.Screen name="Groups" component={GroupsScreen} /><Stack.Screen name="Settings" component={SettingsScreen} /><Stack.Screen name="MessageSettings" component={MessageResponseSettingsScreen} /><Stack.Screen name="Logs" component={LogsScreen} /><Stack.Screen name="Platform" component={PlatformScreen} /><Stack.Screen name="ComingSoon" component={ComingSoonScreen} /></Stack.Navigator></AdminMenuProvider></NavigationContainer>;
}

function PlatformNavigator({ profileLabel, onLogout }: { profileLabel?: string | null; onLogout: () => void }) {
  const navigationRef = useRef(createNavigationContainerRef<AdminStackParamList>()).current;
  return <NavigationContainer ref={navigationRef}><AdminMenuProvider mode="platform" profileLabel={profileLabel} onLogout={onLogout} navigationRef={navigationRef}><Stack.Navigator screenOptions={{ headerShown: false }}><Stack.Screen name="Platform" component={PlatformScreen} /><Stack.Screen name="ComingSoon" component={ComingSoonScreen} /></Stack.Navigator></AdminMenuProvider></NavigationContainer>;
}

function Root() {
  const colors = useColors();
  const auth = useAdminAuth();
  const dark = useColorScheme() === 'dark';
  useEffect(() => { StatusBar.setBarStyle(dark ? 'light-content' : 'dark-content'); }, [dark]);
  if (auth.status === 'loading') return <Screen><Text style={{ color: colors.muted, textAlign: 'center', marginTop: 80 }}>กำลังโหลดบัญชี…</Text></Screen>;
  if (auth.status === 'signed_out') return <LoginScreen />;
  const profileLabel = auth.me?.name ?? auth.orgName;
  if (auth.me?.is_platform_admin && !auth.orgId) return <PlatformNavigator profileLabel={profileLabel} onLogout={() => void auth.logout()} />;
  return <AdminNavigator profileLabel={profileLabel} onLogout={() => void auth.logout()} />;
}

export default function App() {
  return <SafeAreaProvider><QueryClientProvider client={queryClient}><AdminAuthProvider><Root /></AdminAuthProvider></QueryClientProvider></SafeAreaProvider>;
}
