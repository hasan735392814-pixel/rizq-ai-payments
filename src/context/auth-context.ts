import { createContext } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Business } from '@/types/database';

export interface AuthState {
  session: Session | null;
  business: Business | null;
  loading: boolean;
  businessError: boolean;
  reloadBusiness: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);
