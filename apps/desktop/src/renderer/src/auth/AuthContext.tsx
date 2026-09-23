import React, { createContext, useContext, useEffect, useState } from 'react';
import { getSupabase, initSupabase, getSession, getProfile, signOut as sharedSignOut } from '@amber-flow/shared';
import type { Role } from '@amber-flow/shared';
import { isDemoMode, setDemoMode, demoProfile } from '../demo/demoData';

// Desktop runs in a browser-like renderer, so plain localStorage works —
// initSupabase(storage) only needs to be called explicitly on React Native.
initSupabase();

interface AuthUser {
  id: string;
  email?: string;
  name: string;
  role: Role;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  isDemo: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  enterDemoMode: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(isDemoMode());

  async function loadUser() {
    if (isDemoMode()) {
      setUser({ id: demoProfile.id, name: demoProfile.name, role: demoProfile.role });
      setIsDemo(true);
      setLoading(false);
      return;
    }
    const session = await getSession();
    if (!session) {
      // Login is temporarily skipped: with no real session, drop straight
      // into demo mode instead of showing the login screen.
      enterDemoMode();
      return;
    }
    const { data: profile } = await getProfile(session.user.id);
    setUser({
      id: session.user.id,
      email: session.user.email,
      name: profile?.name || session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'User',
      role: (profile?.role as Role) || 'agent',
    });
    setLoading(false);
  }

  useEffect(() => {
    loadUser();
    const { data: sub } = getSupabase().auth.onAuthStateChange(() => {
      if (!isDemoMode()) loadUser();
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  function enterDemoMode() {
    setDemoMode(true);
    setIsDemo(true);
    setUser({ id: demoProfile.id, name: demoProfile.name, role: demoProfile.role });
    setLoading(false);
  }

  async function signOut() {
    if (isDemoMode()) {
      // Login is temporarily skipped, so "sign out" just resets demo state
      // and re-enters a fresh demo session rather than landing on /login.
      setDemoMode(false);
      enterDemoMode();
      return;
    }
    await sharedSignOut();
    enterDemoMode();
  }

  return (
    <AuthContext.Provider value={{ user, loading, isDemo, signOut, refresh: loadUser, enterDemoMode }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
