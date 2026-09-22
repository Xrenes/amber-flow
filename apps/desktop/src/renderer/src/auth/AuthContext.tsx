import React, { createContext, useContext, useEffect, useState } from 'react';
import { getSupabase, initSupabase, getSession, getProfile, signOut as sharedSignOut } from '@amber-flow/shared';
import type { Role } from '@amber-flow/shared';

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
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadUser() {
    const session = await getSession();
    if (!session) {
      setUser(null);
      setLoading(false);
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
      loadUser();
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signOut() {
    await sharedSignOut();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, signOut, refresh: loadUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
