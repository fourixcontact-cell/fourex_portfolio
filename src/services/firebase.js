import { initializeApp, deleteApp } from 'firebase/app';
import {
  initializeAuth, browserLocalPersistence, connectAuthEmulator, signInWithEmailAndPassword, signOut,
  createUserWithEmailAndPassword, updateProfile, sendPasswordResetEmail, reauthenticateWithCredential,
  EmailAuthProvider, updatePassword, getIdTokenResult
} from 'firebase/auth';
/**
 * The only "backend": Firebase Authentication + Cloud Firestore, used straight from the browser.
 * Values come from the Firebase console → Project settings → Your apps → Web app.
 */
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || (projectId ? `${projectId}.firebaseapp.com` : undefined),
  projectId,
  ...(import.meta.env.VITE_FIREBASE_APP_ID ? { appId: import.meta.env.VITE_FIREBASE_APP_ID } : {})
};
export const isConfigured = !!(firebaseConfig.apiKey && firebaseConfig.projectId);

const authEmulator = import.meta.env.VITE_AUTH_EMULATOR_HOST; // e.g. 127.0.0.1:9099 (development only)

export const app = initializeApp(firebaseConfig);
export const auth = initializeAuth(app, { persistence: browserLocalPersistence });
if (authEmulator) connectAuthEmulator(auth, `http://${authEmulator}`, { disableWarnings: true });

export const authApi = {
  async signIn(email, password) {
    const c = await signInWithEmailAndPassword(auth, email, password);
    return { uid: c.user.uid, email: c.user.email, displayName: c.user.displayName || '' };
  },
  signOut: () => signOut(auth).catch(() => {}),
  async currentUser() {
    await auth.authStateReady();
    const u = auth.currentUser;
    return u ? { uid: u.uid, email: u.email, name: u.displayName || '' } : null;
  },
  async tokenInfo() {
    await auth.authStateReady();
    if (!auth.currentUser) return null;
    const t = await getIdTokenResult(auth.currentUser);
    return { authTimeMs: Date.parse(t.authTime), email: t.claims.email, uid: auth.currentUser.uid };
  },
  async idToken() {
    await auth.authStateReady();
    return auth.currentUser ? auth.currentUser.getIdToken() : null;
  },
  /** Re-checks the current password, then sets the new one. */
  async changePassword(currentPassword, newPassword) {
    const u = auth.currentUser;
    if (!u) throw Object.assign(new Error('Not signed in'), { code: 'auth/no-current-user' });
    await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, currentPassword));
    await updatePassword(u, newPassword);
    await u.getIdToken(true);
  },
  /**
   * Creates a client's portal login. Done on a throw-away second Firebase app, because creating
   * a user signs that user in, and we must not sign the admin out.
   */
  async createPortalUser(email, password, name) {
    const tmp = initializeApp(firebaseConfig, `portal-create-${Date.now()}`);
    try {
      const a = initializeAuth(tmp, { persistence: [] });
      if (authEmulator) connectAuthEmulator(a, `http://${authEmulator}`, { disableWarnings: true });
      const c = await createUserWithEmailAndPassword(a, email, password);
      if (name) await updateProfile(c.user, { displayName: name }).catch(() => {});
      await signOut(a).catch(() => {});
      return c.user.uid;
    } finally {
      deleteApp(tmp).catch(() => {});
    }
  },
  sendPasswordReset: (email) => sendPasswordResetEmail(auth, email, { url: `${window.location.origin}/portal/login` })
};

export async function hasSession() {
  await auth.authStateReady();
  return !!auth.currentUser;
}
