import React from 'react';
import 'react-native-url-polyfill/auto';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/auth/AuthContext';
import { SettingsProvider } from './src/features/settings/SettingsContext';
import RootNavigator from './src/navigation/RootNavigator';

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <SettingsProvider>
          <StatusBar style="light" />
          <RootNavigator />
        </SettingsProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
