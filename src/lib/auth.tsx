import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  createUserWithEmailAndPassword, onAuthStateChanged, sendEmailVerification, sendPasswordResetEmail,
  signInWithEmailAndPassword, signOut as fbSignOut, updateProfile, type User,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { auth, db } from './firebase';
import type { AppUser, Invite } from './types';

interface AuthContextValue {
  firebaseUser: User | null;
  /** null when signed out, unverified, or verified without an invite. */
  appUser: AppUser | null;
  loading: boolean;
  /** Message to show on the login screen (e.g. deactivated account). */
  notice: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  /** Reload the Firebase user, refresh the token and re-run the invite claim. Resolves true when a profile exists. */
  refreshClaim: () => Promise<boolean>;
  resendVerification: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

let actorName = '';
export function getActorName(): string {
  return actorName;
}

export function friendlyAuthError(err: unknown): string {
  const code = typeof err === 'object' && err && 'code' in err ? String((err as { code: unknown }).code) : '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'That email and password do not match.';
    case 'auth/email-already-in-use': return 'An account with this email already exists. Try signing in.';
    case 'auth/weak-password': return 'Choose a password with at least 6 characters.';
    case 'auth/invalid-email': return 'That email address does not look right.';
    case 'auth/too-many-requests': return 'Too many attempts. Wait a few minutes and try again.';
    case 'auth/network-request-failed': return 'No connection. Check your signal and try again.';
    case 'auth/requires-recent-login': return 'For security, sign out and back in, then try again.';
    default: return err instanceof Error ? err.message : 'Something went wrong. Please try again.';
  }
}

async function loadAppUser(user: User): Promise<AppUser | null> {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return { ...(snap.data() as AppUser), uid: user.uid };
  if (!user.emailVerified || !user.email) return null;

  // Claim the invite with a fresh token so email_verified is true in the rules.
  await user.getIdToken(true);
  const email = user.email.toLowerCase();
  const inviteRef = doc(db, 'invites', email);
  const inviteSnap = await getDoc(inviteRef);
  if (!inviteSnap.exists()) return null;
  const invite = inviteSnap.data() as Invite;
  const batch = writeBatch(db);
  batch.set(ref, {
    uid: user.uid,
    email,
    displayName: user.displayName || email,
    role: invite.role,
    schoolId: invite.schoolId ?? null,
    active: true,
    createdAt: serverTimestamp(),
  });
  batch.delete(inviteRef);
  await batch.commit();
  const created = await getDoc(ref);
  return created.exists() ? { ...(created.data() as AppUser), uid: user.uid } : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const signingUp = useRef(false);

  const resolve = useCallback(async (user: User | null): Promise<AppUser | null> => {
    if (!user) {
      setAppUser(null);
      actorName = '';
      return null;
    }
    let profile: AppUser | null = null;
    try {
      profile = await loadAppUser(user);
    } catch {
      profile = null;
    }
    if (profile && !profile.active) {
      setNotice('Your account has been deactivated. Contact your school administrator.');
      setAppUser(null);
      actorName = '';
      await fbSignOut(auth);
      return null;
    }
    setAppUser(profile);
    actorName = profile?.displayName ?? user.displayName ?? user.email ?? '';
    return profile;
  }, []);

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      if (signingUp.current) return;
      setLoading(true);
      void resolve(user).finally(() => setLoading(false));
    });
  }, [resolve]);

  const signIn = useCallback(async (email: string, password: string) => {
    setNotice(null);
    await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    setNotice(null);
    signingUp.current = true;
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
      await updateProfile(cred.user, { displayName: displayName.trim() });
      await sendEmailVerification(cred.user);
      setFirebaseUser(cred.user);
      setAppUser(null);
    } finally {
      signingUp.current = false;
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    await fbSignOut(auth);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email.trim().toLowerCase());
  }, []);

  const refreshClaim = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) return false;
    await user.reload();
    if (user.emailVerified) await user.getIdToken(true);
    setFirebaseUser(auth.currentUser);
    const profile = await resolve(auth.currentUser);
    return profile !== null;
  }, [resolve]);

  const resendVerification = useCallback(async () => {
    if (auth.currentUser) await sendEmailVerification(auth.currentUser);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ firebaseUser, appUser, loading, notice, signIn, signUp, signOut, resetPassword, refreshClaim, resendVerification }),
    [firebaseUser, appUser, loading, notice, signIn, signUp, signOut, resetPassword, refreshClaim, resendVerification],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
