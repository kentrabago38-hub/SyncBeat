import {
  onIdTokenChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  User,
} from 'firebase/auth';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { auth, googleAuthProvider } from '../lib/firebase';

interface AuthContextValue {
  user: User | null;
  idToken: string | null;
  loading: boolean;
  signingIn: boolean;
  signingOut: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function formatAuthError(error: unknown, fallback: string): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';

  switch (code) {
    case 'auth/popup-blocked':
      return 'Sign-in popup was blocked by your browser. Please allow popups for this site and try again.';
    case 'auth/unauthorized-domain':
      return 'This domain is not authorized for sign-in in Firebase Authentication settings.';
    case 'auth/network-request-failed':
      return 'Network error while contacting Google Sign-In. Check your connection and try again.';
    case 'auth/operation-not-allowed':
      return 'Google Sign-In is not enabled for this project yet.';
    case 'auth/too-many-requests':
      return 'Too many sign-in attempts. Please wait a moment and try again.';
    default:
      return error instanceof Error && error.message ? error.message : fallback;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const signInInFlightRef = useRef(false);

  useEffect(() => {
    let active = true;
    const unsubscribe = onIdTokenChanged(
      auth,
      async (nextUser) => {
        if (!active) return;
        setUser(nextUser);
        if (nextUser) {
          try {
            const token = await nextUser.getIdToken();
            if (active) setIdToken(token);
          } catch {
            if (active) setIdToken(null);
          }
        } else {
          setIdToken(null);
        }
        if (active) setLoading(false);
      },
      (error) => {
        if (!active) return;
        setAuthError(formatAuthError(error, 'Failed to initialize authentication state.'));
        setLoading(false);
      }
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (signInInFlightRef.current) return;
    signInInFlightRef.current = true;
    setSigningIn(true);
    setAuthError(null);
    try {
      const result = await signInWithPopup(auth, googleAuthProvider);
      setUser(result.user);
      const token = await result.user.getIdToken();
      setIdToken(token);
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? String((error as { code?: unknown }).code)
          : '';
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        setAuthError(formatAuthError(error, 'Sign-in could not be completed.'));
      }
    } finally {
      signInInFlightRef.current = false;
      setSigningIn(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    if (signingOut) return;
    setSigningOut(true);
    setAuthError(null);
    try {
      await firebaseSignOut(auth);
      setUser(null);
      setIdToken(null);
    } catch (error) {
      setAuthError(formatAuthError(error, 'Sign-out failed.'));
    } finally {
      setSigningOut(false);
    }
  }, [signingOut]);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  const value = useMemo(
    () => ({
      user,
      idToken,
      loading,
      signingIn,
      signingOut,
      authError,
      signInWithGoogle,
      signOut,
      clearAuthError,
    }),
    [authError, clearAuthError, idToken, loading, signInWithGoogle, signOut, signingIn, signingOut, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
