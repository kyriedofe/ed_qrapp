import { useState, useEffect } from 'react';
import { supabase } from './supabase';
import type { Session, User } from '@supabase/supabase-js';

type AuthState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
};

// Start in loading state so the app shows a splash spinner while
// restoreSession() checks SecureStore for a saved session.
let globalSession: Session | null = null;
let globalUser: User | null = null;
let globalLoading = true;
let listeners: Set<() => void> = new Set();

function notify() {
  listeners.forEach((l) => l());
}

export function setAuth(session: Session | null) {
  globalSession = session;
  globalUser = session?.user ?? null;
  globalLoading = false;
  notify();
}

export function useAuth(): AuthState {
  const [, forceRender] = useState(0);

  useEffect(() => {
    const listener = () => forceRender((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return {
    session: globalSession,
    user: globalUser,
    loading: globalLoading,
  };
}

// ------------------------------------------------------------
// Session restore (session handling requirement)
// Called once from the root layout. Reads the session saved by
// supabase-js in SecureStore. A timeout guard makes sure the app
// can never hang on a stuck refresh — after 4 seconds we fall
// back to the login screen instead.
// ------------------------------------------------------------
const RESTORE_TIMEOUT_MS = 4000;
let restoreStarted = false;

export async function restoreSession(): Promise<void> {
  if (restoreStarted) return;
  restoreStarted = true;

  try {
    const session = await Promise.race<Session | null>([
      supabase.auth
        .getSession()
        .then(({ data }) => data.session ?? null)
        .catch(() => null),
      new Promise<Session | null>((resolve) =>
        setTimeout(() => resolve(null), RESTORE_TIMEOUT_MS)
      ),
    ]);
    setAuth(session ?? null);
  } catch {
    setAuth(null);
  }
}

export type SignUpProfile = {
  full_name: string;
  role: 'student' | 'teacher';
};

export async function signUp(
  email: string,
  password: string,
  profile?: SignUpProfile
) {
  // full_name + role travel in the sign-up metadata; the
  // handle_new_user() database trigger writes them into the
  // profiles row in one step (role is sanitized there, so a
  // client can never sign up directly as 'admin').
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: profile?.full_name ?? '',
        role: profile?.role ?? 'student',
      },
    },
  });

  if (!error && data.session) {
    setAuth(data.session);
  }
  return { data, error };
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (!error && data.session) {
    setAuth(data.session);
  }
  return { data, error };
}

export async function signOut() {
  setAuth(null);
  supabase.auth.signOut().catch(() => {});
  return { error: null };
}
