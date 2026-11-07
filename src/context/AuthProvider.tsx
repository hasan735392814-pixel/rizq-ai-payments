import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Business } from '@/types/database';
import { AuthContext, type AuthState } from '@/context/auth-context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [business, setBusiness] = useState<Business | null>(null);
  const [businessLoaded, setBusinessLoaded] = useState(false);
  const [businessError, setBusinessError] = useState(false);

  const loadBusiness = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('businesses')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    setBusinessError(Boolean(error));
    setBusiness(error ? null : (data as Business | null));
    setBusinessLoaded(true);
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setInitialized(true);
      if (data.session) {
        void loadBusiness(data.session.user.id);
      } else {
        setBusinessLoaded(true);
      }
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      (async () => {
        if (nextSession) {
          setBusinessLoaded(false);
          await loadBusiness(nextSession.user.id);
        } else {
          setBusiness(null);
          setBusinessError(false);
          setBusinessLoaded(true);
        }
      })();
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [loadBusiness]);

  const reloadBusiness = useCallback(async () => {
    if (session) await loadBusiness(session.user.id);
  }, [session, loadBusiness]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      business,
      loading: !initialized || (Boolean(session) && !businessLoaded),
      businessError,
      reloadBusiness,
      signOut,
    }),
    [session, business, initialized, businessLoaded, businessError, reloadBusiness, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
