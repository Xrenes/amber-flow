import React from 'react';
import { View, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../auth/AuthContext';
import { useTimeTracker } from '../features/tracker/useTimeTracker';
import { useScreenActivity } from '../features/screenActivity/useScreenActivity';
import { usePlugins } from '../features/plugins/usePlugins';
import LoginScreen from '../screens/LoginScreen';
import HomeScreen from '../screens/HomeScreen';
import TrackerScreen from '../screens/TrackerScreen';
import ReportsScreen from '../screens/ReportsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { colors } from '../theme/colors';

export type TabKey = 'home' | 'reports' | 'tracker' | 'settings';

// Bottom-tab-style shell built by hand (no @react-navigation/bottom-tabs
// dependency needed for 4 static tabs) — swaps the visible screen while
// keeping each mounted so tracker/timer state isn't lost when switching tabs.
// The tab bar is a floating icon-only pill (inset from the screen edges,
// rounded, elevated) rather than a flush full-width bar — its bottom offset
// is driven by the device's safe-area inset (0 on an iPhone 7 Plus's
// physical-home-button screen, the home-indicator height on notched/Dynamic-
// Island iPhones and gesture-nav Android) so it floats clear of system UI
// on every device instead of colliding with it.
function MainTabs() {
  const { user } = useAuth();
  const [active, setActive] = React.useState<TabKey>('home');
  const insets = useSafeAreaInsets();

  // Lifted here (not inside TrackerScreen) so it's a single instance across
  // all simultaneously-mounted tabs — its Realtime subscription would throw
  // "cannot add postgres_changes callbacks after subscribe()" if a second
  // hook instance existed. Also lets screen-activity tracking know whether a
  // work session is currently running without a second subscription.
  const tracker = useTimeTracker(user?.id);
  const { isEnabled: isPluginEnabled } = usePlugins();
  useScreenActivity(user?.id, isPluginEnabled('screen-activity') && tracker.buttonState === 'running');

  const TABS: { key: TabKey; icon: keyof typeof Feather.glyphMap; render: () => React.ReactNode }[] = [
    { key: 'home', icon: 'home', render: () => <HomeScreen /> },
    { key: 'reports', icon: 'bar-chart-2', render: () => <ReportsScreen trackerSessions={tracker.sessions} /> },
    {
      key: 'tracker',
      icon: 'clock',
      render: () => <TrackerScreen tracker={tracker} qrCheckInEnabled={isPluginEnabled('mobile-qr-checkin')} />,
    },
    { key: 'settings', icon: 'settings', render: () => <SettingsScreen /> },
  ];

  return (
    <View style={styles.root}>
      <View style={styles.screens}>
        {TABS.map(({ key, render }) => (
          <View key={key} style={[styles.screen, active !== key && styles.hidden]}>
            {render()}
          </View>
        ))}
      </View>
      <View style={[styles.tabBarWrap, { bottom: Math.max(insets.bottom, 12) }]} pointerEvents="box-none">
        <View style={styles.tabBar}>
          {TABS.map((t) => {
            const isActive = active === t.key;
            return (
              <TouchableOpacity
                key={t.key}
                style={[styles.tabItem, isActive && styles.tabItemActive]}
                onPress={() => setActive(t.key)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather name={t.icon} size={20} color={isActive ? colors.bg0 : colors.textDim} />
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const Stack = createNativeStackNavigator();

const navTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg0, card: colors.bg1, border: colors.border, text: colors.text, primary: colors.accent },
};

export default function RootNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? <Stack.Screen name="Main" component={MainTabs} /> : <Stack.Screen name="Login" component={LoginScreen} />}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: colors.bg0, alignItems: 'center', justifyContent: 'center' },
  root: { flex: 1, backgroundColor: colors.bg0 },
  screens: { flex: 1 },
  screen: { ...StyleSheet.absoluteFill },
  hidden: { display: 'none' },
  tabBarWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  tabBar: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: colors.bg1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  },
  tabItem: {
    width: 48,
    height: 48,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabItemActive: {
    backgroundColor: colors.accent,
  },
});
