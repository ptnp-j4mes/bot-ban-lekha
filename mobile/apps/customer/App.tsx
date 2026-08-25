/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Screen } from '../../shared/src/ui';
import { useColors } from '../../shared/src/theme';
import type { CustomerStackParamList } from './src/navigation';
import { CustomerAuthProvider, CustomerLoginPrompt, useCustomerAuth } from './src/auth';
import { CustomerHomeScreen } from './src/screens/CustomerHomeScreen';
import { InstallmentsScreen } from './src/screens/InstallmentsScreen';
import { PaymentsScreen } from './src/screens/PaymentsScreen';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 20_000 } } });
const Stack = createNativeStackNavigator<CustomerStackParamList>();

function CustomerNavigator() {
  return <NavigationContainer><Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}><Stack.Screen name="Home" component={CustomerHomeScreen} /><Stack.Screen name="Installments" component={InstallmentsScreen} /><Stack.Screen name="Payments" component={PaymentsScreen} /></Stack.Navigator></NavigationContainer>;
}

function Root() {
  const colors = useColors();
  const { stage } = useCustomerAuth();
  useEffect(() => { StatusBar.setBarStyle(colors.ink === '#f2faf6' ? 'light-content' : 'dark-content'); }, [colors.ink]);
  if (stage === 'loading') return <Screen><Text style={{ color: colors.muted, textAlign: 'center', marginTop: 80 }}>กำลังโหลดข้อมูล…</Text></Screen>;
  if (stage !== 'ready') return <CustomerLoginPrompt />;
  return <CustomerNavigator />;
}

export default function App() {
  return <SafeAreaProvider><QueryClientProvider client={queryClient}><CustomerAuthProvider><Root /></CustomerAuthProvider></QueryClientProvider></SafeAreaProvider>;
}
