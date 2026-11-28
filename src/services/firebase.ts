import { initializeApp } from 'firebase/app';
import {
  getAuth,
  browserLocalPersistence,
  setPersistence,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendEmailVerification,
  sendPasswordResetEmail,
  applyActionCode,
  verifyPasswordResetCode,
  confirmPasswordReset,
  signOut,
  deleteUser,
  onAuthStateChanged,
  type ActionCodeSettings,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  type FirestoreSettings,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  serverTimestamp,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  AdminRoleRecord,
  AppAppearance,
  FavoriteRadio,
  Language,
  MemorizationItem,
  RegisteredUserSummary,
  UserProfile,
  VerseBookmark,
  VisitRecord,
} from '../types/nour';

const app = initializeApp(firebaseConfig);

type BrowserFirestoreSettings = FirestoreSettings & {
  experimentalForceLongPolling?: boolean;
  useFetchStreams?: boolean;
};

function createFirestoreDb() {
  const settings: BrowserFirestoreSettings =
    typeof window !== 'undefined'
      ? {
          localCache: memoryLocalCache(),
          experimentalForceLongPolling: true,
          useFetchStreams: true,
        }
      : {
          localCache: memoryLocalCache(),
        };

  try {
    return initializeFirestore(app, settings, firebaseConfig.firestoreDatabaseId);
  } catch {
    return getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
}

export const db = createFirestoreDb();
export const auth = getAuth(app);
auth.languageCode = 'ar';
setPersistence(auth, browserLocalPersistence).catch(() => {});
export const googleProvider = new GoogleAuthProvider();

export const APP_EMAIL_BRAND_AR = 'نور — رفيق القرآن الكريم';
export const APP_EMAIL_BRAND_EN = 'Nour — Quran Companion';
export const AUTH_VERIFICATION_STATUS_EVENT = 'nour:auth-verification-status';

const PRODUCTION_SITE_ORIGIN = 'https://nouralqran.vercel.app';

let pendingSignUpPromise: Promise<void> | null = null;

export async function waitForPendingSignUp(): Promise<void> {
  if (pendingSignUpPromise) {
    try {
      await pendingSignUpPromise;
    } catch {
      // Ignore errors here; handled by caller
    }
  }
}

function buildActionCodeSettings(lang: Language, originOverride?: string): ActionCodeSettings {
  const origin =
    originOverride ||
    (typeof window !== 'undefined' && window.location.origin
      ? window.location.origin
      : PRODUCTION_SITE_ORIGIN);
  return {
    url: `${origin}/?nourAuth=1&lang=${lang}`,
    handleCodeInApp: false,
  };
}

async function runEmailActionWithBranding(
  lang: Language,
  sender: (settings?: ActionCodeSettings) => Promise<void>
): Promise<void> {
  auth.languageCode = lang === 'en' ? 'en' : 'ar';
  try {
    await sender(buildActionCodeSettings(lang));
  } catch (err) {
    const code = (err as { code?: string })?.code || '';
    const msg = err instanceof Error ? err.message : String(err);
    if (
      code === 'auth/unauthorized-continue-uri' ||
      code === 'auth/invalid-continue-uri' ||
      msg.includes('unauthorized-continue-uri') ||
      msg.includes('invalid-continue-uri')
    ) {
      try {
        await sender(buildActionCodeSettings(lang, PRODUCTION_SITE_ORIGIN));
        return;
      } catch (fallbackErr) {
        const fallbackCode = (fallbackErr as { code?: string })?.code || '';
        const fallbackMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
        if (
          fallbackCode === 'auth/unauthorized-continue-uri' ||
          fallbackCode === 'auth/invalid-continue-uri' ||
          fallbackMsg.includes('unauthorized-continue-uri') ||
          fallbackMsg.includes('invalid-continue-uri')
        ) {
          await sender(undefined);
          return;
        }
        throw fallbackErr;
      }
    }
    throw err;
  }
}

export function waitForAuthReady(): Promise<void> {
  return auth.authStateReady();
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function fetchFirestoreRestAppearance(): Promise<AppAppearance | null> {
  if (typeof fetch !== 'function') return null;
  const endpoint = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    firebaseConfig.projectId
  )}/databases/${encodeURIComponent(
    firebaseConfig.firestoreDatabaseId
  )}/documents/appConfig/appearance?key=${encodeURIComponent(firebaseConfig.apiKey)}`;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller && typeof window !== 'undefined' ? window.setTimeout(() => controller.abort(), 5000) : null;
  try {
    const res = await fetch(endpoint, controller ? { signal: controller.signal } : undefined);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      fields?: {
        backgroundType?: { stringValue?: string };
        backgroundUrl?: { stringValue?: string };
        backgroundOpacity?: { doubleValue?: number; integerValue?: string };
        backgroundBlur?: { integerValue?: string; doubleValue?: number };
        updatedBy?: { stringValue?: string };
        updatedAt?: { timestampValue?: string };
      };
    };
    const f = json?.fields;
    if (!f) return null;
    const bgType = (f.backgroundType?.stringValue || 'default_mosque') as AppAppearance['backgroundType'];
    const safeUrl = sanitizeAppearanceUrl(String(f.backgroundUrl?.stringValue || ''));
    const opacityRaw = f.backgroundOpacity?.doubleValue ?? Number(f.backgroundOpacity?.integerValue ?? 0.26);
    const blurRaw = Number(f.backgroundBlur?.integerValue ?? f.backgroundBlur?.doubleValue ?? 0);
    return {
      backgroundType: bgType,
      backgroundUrl: safeUrl || (bgType === 'none' ? '' : DEFAULT_APP_APPEARANCE.backgroundUrl),
      backgroundOpacity: Math.min(0.9, Math.max(0.05, Number.isFinite(opacityRaw) ? opacityRaw : 0.26)),
      backgroundBlur: Math.min(24, Math.max(0, Math.round(Number.isFinite(blurRaw) ? blurRaw : 0))),
      updatedBy: f.updatedBy?.stringValue,
      updatedAt: f.updatedAt?.timestampValue,
    };
  } catch {
    return null;
  } finally {
    if (timer !== null && typeof window !== 'undefined') {
      window.clearTimeout(timer);
    }
  }
}

export async function testConnection(): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return;
  }
  const probe = () => getDocFromServer(doc(db, 'test', 'connection'));
  try {
    await probe();
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      const restOk = await fetchFirestoreRestAppearance().then((d) => d !== null);
      if (restOk) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1800));
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        return;
      }
      try {
        await probe();
      } catch (retryError) {
        if (retryError instanceof Error && retryError.message.includes('the client is offline')) {
          console.error('Please check your Firebase configuration.');
        }
      }
    }
  }
}

testConnection();

export function subscribeToAuth(cb: (user: User | null) => void) {
  return onAuthStateChanged(auth, cb);
}

export async function signInGoogle() {
  auth.languageCode = 'ar';
  return signInWithPopup(auth, googleProvider);
}

export async function signInEmail(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email.trim(), password);
}

export interface SignUpResult {
  user: User;
  verificationSent: boolean;
  verificationError?: string;
}

export async function signUpEmail(
  name: string,
  email: string,
  password: string,
  lang: Language = 'ar'
): Promise<SignUpResult> {
  let resolveSignUpLock!: () => void;
  pendingSignUpPromise = new Promise<void>((resolve) => {
    resolveSignUpLock = resolve;
  });

  try {
    const cleanEmail = email.trim();
    const cleanName = name.trim() || (lang === 'ar' ? 'قارئ نور' : 'Nour Reader');
    const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);

    try {
      await updateProfile(cred.user, { displayName: cleanName });
    } catch {
      // Non-fatal: displayName will be saved in Firestore profile once verified
    }

    let verificationSent = false;
    let verificationError: string | undefined;
    try {
      await runEmailActionWithBranding(lang, (settings) =>
        sendEmailVerification(cred.user, settings)
      );
      verificationSent = true;
    } catch (err) {
      verificationSent = false;
      verificationError = mapFirebaseAuthError(err, lang);
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent(AUTH_VERIFICATION_STATUS_EVENT, {
          detail: {
            sent: verificationSent,
            email: cleanEmail,
            error: verificationError,
          },
        })
      );
    }

    return {
      user: cred.user,
      verificationSent,
      verificationError,
    };
  } finally {
    resolveSignUpLock();
    pendingSignUpPromise = null;
  }
}

export async function resendVerificationEmail(
  lang: Language = 'ar'
): Promise<{ alreadyVerified: boolean }> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error(
      lang === 'ar'
        ? 'يرجى تسجيل الدخول أولاً لإعادة إرسال رابط التحقق.'
        : 'Please sign in first to resend the verification email.'
    );
  }
  await user.reload();
  if (user.emailVerified) {
    await user.getIdToken(true).catch(() => {});
    return { alreadyVerified: true };
  }
  await runEmailActionWithBranding(lang, (settings) =>
    sendEmailVerification(user, settings)
  );
  return { alreadyVerified: false };
}

export async function reloadCurrentUser(): Promise<User | null> {
  const user = auth.currentUser;
  if (!user) return null;
  await user.reload();
  if (user.emailVerified) {
    // Force-refresh JWT ID token so Firestore security rules immediately see email_verified == true
    await user.getIdToken(true).catch(() => {});
  }
  return user;
}

export async function applyEmailVerificationCode(oobCode: string): Promise<User | null> {
  await applyActionCode(auth, oobCode);
  return reloadCurrentUser();
}

export async function verifyResetCode(oobCode: string): Promise<string> {
  return verifyPasswordResetCode(auth, oobCode);
}

export async function confirmNewPassword(oobCode: string, newPassword: string): Promise<void> {
  return confirmPasswordReset(auth, oobCode, newPassword);
}

export function mapFirebaseAuthError(err: unknown, lang: Language): string {
  const code = (err as { code?: string })?.code || '';
  const msg = err instanceof Error ? err.message : String(err);
  const host = typeof window !== 'undefined' ? window.location.hostname : '';

  if (code === 'auth/unauthorized-domain' || msg.includes('unauthorized-domain')) {
    return lang === 'ar'
      ? `النطاق (${host || 'Vercel'}) غير مضاف بعد في قائمة النطاقات المصرح بها في Firebase Console ← Authentication ← Settings ← Authorized domains. أضفه هناك لتفعيل الدخول وإنشاء الحساب فوراً.`
      : `Domain (${host || 'Vercel'}) is not yet listed in Firebase Console -> Authentication -> Settings -> Authorized domains. Add it there to enable sign-up and sign-in.`;
  }
  if (code === 'auth/unauthorized-continue-uri' || code === 'auth/invalid-continue-uri') {
    return lang === 'ar'
      ? `نطاق إعادة التوجيه (${host || 'Vercel'}) يحتاج لإضافته في Authorized domains داخل Firebase Console.`
      : `Continue domain (${host || 'Vercel'}) must be added to Authorized domains in Firebase Console.`;
  }
  if (code === 'auth/operation-not-allowed' || msg.includes('operation-not-allowed')) {
    return lang === 'ar'
      ? 'تسجيل الحساب بالبريد غير مفعّل بعد في Firebase Console (Authentication ← Sign-in method ← Email/Password). يمكنك المتابعة عبر Google أو كضيف الآن.'
      : 'Email/Password sign-up is not enabled yet in Firebase Console (Authentication -> Sign-in method -> Email/Password). You can use Google or Continue as Guest.';
  }
  if (code === 'auth/email-already-in-use' || msg.includes('email-already-in-use')) {
    return lang === 'ar'
      ? 'هذا البريد الإلكتروني مسجل مسبقاً. يمكنك تسجيل الدخول أو استخدام «نسيت كلمة المرور؟».'
      : 'This email is already registered. Please sign in or use Forgot Password.';
  }
  if (code === 'auth/weak-password' || msg.includes('weak-password')) {
    return lang === 'ar'
      ? 'كلمة المرور ضعيفة، يجب أن تتكون من ٦ أحرف على الأقل.'
      : 'Password is too weak. Please use at least 6 characters.';
  }
  if (code === 'auth/invalid-email' || msg.includes('invalid-email')) {
    return lang === 'ar' ? 'صيغة البريد الإلكتروني غير صحيحة.' : 'Please enter a valid email address.';
  }
  if (code === 'auth/missing-email' || msg.includes('missing-email')) {
    return lang === 'ar' ? 'يرجى إدخال البريد الإلكتروني أولاً.' : 'Please enter your email address first.';
  }
  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found' ||
    msg.includes('invalid-credential')
  ) {
    return lang === 'ar'
      ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة.'
      : 'Incorrect email or password.';
  }
  if (code === 'auth/expired-action-code' || msg.includes('expired-action-code')) {
    return lang === 'ar'
      ? 'انتهت صلاحية هذا الرابط. يرجى طلب رابط جديد وإتمام الإجراء خلال ساعة.'
      : 'This action link has expired. Please request a new link.';
  }
  if (code === 'auth/invalid-action-code' || msg.includes('invalid-action-code')) {
    return lang === 'ar'
      ? 'رابط التحقق أو الاستعادة غير صالح أو تم استخدامه مسبقاً.'
      : 'This verification or reset link is invalid or has already been used.';
  }
  if (code === 'auth/user-disabled' || msg.includes('user-disabled')) {
    return lang === 'ar'
      ? 'تم تعطيل هذا الحساب مؤقتاً. تواصل مع الدعم للمساعدة.'
      : 'This account has been disabled.';
  }
  if (code === 'auth/account-exists-with-different-credential') {
    return lang === 'ar'
      ? 'هذا البريد مسجل مسبقاً بطريقة دخول أخرى (مثل Google). جرّب المتابعة عبر Google.'
      : 'An account already exists with this email using a different sign-in method (such as Google).';
  }
  if (code === 'auth/too-many-requests' || msg.includes('too-many-requests')) {
    return lang === 'ar'
      ? 'تم إرسال عدة طلبات متتالية. يرجى الانتظار دقيقة ثم المحاولة مجدداً، وتأكد أيضاً من مجلد الرسائل غير المرغوب فيها (Spam).'
      : 'Too many attempts. Please wait a minute before trying again, and check your Spam folder.';
  }
  if (code === 'auth/network-request-failed' || msg.includes('network-request-failed')) {
    return lang === 'ar'
      ? 'تعذر الاتصال بالشبكة، تحقق من الإنترنت ثم حاول مجدداً.'
      : 'Network error. Please check your connection and try again.';
  }
  if (code === 'auth/popup-blocked' || msg.includes('popup-blocked')) {
    return lang === 'ar'
      ? 'تم حظر النافذة المنبثقة من المتصفح. يرجى السماح بالنوافذ المنبثقة أو المتابعة كضيف.'
      : 'Browser blocked the sign-in popup. Allow popups or continue as guest.';
  }
  if (code === 'auth/requires-recent-login' || msg.includes('requires-recent-login')) {
    return lang === 'ar'
      ? 'يرجى تسجيل الدخول مجدداً قبل إتمام هذا الإجراء الحساس.'
      : 'Please sign in again before completing this sensitive action.';
  }
  return msg;
}

export async function resetPasswordEmail(email: string, lang: Language = 'ar'): Promise<void> {
  const cleanEmail = email.trim();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error(
      lang === 'ar' ? 'يرجى إدخال بريد إلكتروني صحيح.' : 'Please enter a valid email address.'
    );
  }
  await runEmailActionWithBranding(lang, (settings) =>
    sendPasswordResetEmail(auth, cleanEmail, settings)
  );
}

export async function logoutAccount() {
  return signOut(auth);
}

export async function deleteCurrentAccount() {
  if (!auth.currentUser) return;
  const uid = auth.currentUser.uid;
  try {
    await deleteDoc(doc(db, 'users', uid));
  } catch {
    // Ignore if profile doc didn't exist yet
  }
  await deleteUser(auth.currentUser);
}

const VALID_ID_REGEX = /^[a-zA-Z0-9_-]+$/;
function assertValidId(id: string) {
  if (!id || id.length > 128 || !VALID_ID_REGEX.test(id)) {
    throw new Error('Invalid document identifier');
  }
}

export async function loadOrCreateUserProfile(
  user: User,
  defaults: Omit<UserProfile, 'uid' | 'displayName' | 'email' | 'emailVerified' | 'isGuest'>
): Promise<UserProfile> {
  assertValidId(user.uid);
  const path = `users/${user.uid}`;
  const ref = doc(db, 'users', user.uid);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const d = snap.data();
      return {
        uid: user.uid,
        displayName: String(d.displayName || user.displayName || 'مستخدم نور').slice(0, 80),
        email: d.email || user.email || undefined,
        language: d.language === 'en' ? 'en' : 'ar',
        theme: d.theme === 'dark' ? 'dark' : 'light',
        defaultReciterId: Number(d.defaultReciterId || 7),
        streakDays: Number(d.streakDays || 0),
        lastReadPage: Number(d.lastReadPage || 1),
        lastReadSurah: Number(d.lastReadSurah || 1),
        lastReadAyah: Number(d.lastReadAyah || 1),
        lastReadDate: String(d.lastReadDate || new Date().toISOString().slice(0, 10)),
        khatmaTargetDays: Number(d.khatmaTargetDays || 30),
        khatmaCurrentPage: Number(d.khatmaCurrentPage || 1),
        khatmaStartDate: String(d.khatmaStartDate || new Date().toISOString().slice(0, 10)),
        weeklyPages: Array.isArray(d.weeklyPages) && d.weeklyPages.length === 7 ? d.weeklyPages.map(Number) : [0, 0, 0, 0, 0, 0, 0],
        emailVerified: user.emailVerified,
        isGuest: false,
      };
    }

    if (!user.emailVerified) {
      return {
        ...defaults,
        uid: user.uid,
        displayName: (user.displayName || 'مستخدم نور').slice(0, 80),
        email: user.email || undefined,
        emailVerified: false,
        isGuest: false,
      };
    }

    const payload = {
      uid: user.uid,
      displayName: (user.displayName || 'مستخدم نور').slice(0, 80),
      ...(user.email ? { email: user.email.slice(0, 160) } : {}),
      language: defaults.language,
      theme: defaults.theme,
      defaultReciterId: defaults.defaultReciterId,
      streakDays: defaults.streakDays,
      lastReadPage: defaults.lastReadPage,
      lastReadSurah: defaults.lastReadSurah,
      lastReadAyah: defaults.lastReadAyah,
      lastReadDate: defaults.lastReadDate.slice(0, 32),
      khatmaTargetDays: defaults.khatmaTargetDays,
      khatmaCurrentPage: defaults.khatmaCurrentPage,
      khatmaStartDate: defaults.khatmaStartDate.slice(0, 32),
      weeklyPages: defaults.weeklyPages.slice(0, 7).map((n) => Math.max(0, Math.round(n))),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(ref, payload);
    return {
      ...defaults,
      uid: user.uid,
      displayName: payload.displayName,
      email: payload.email,
      emailVerified: true,
      isGuest: false,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function syncUserProfilePatch(
  uid: string,
  patch: Partial<Omit<UserProfile, 'uid' | 'isGuest' | 'emailVerified'>>
): Promise<void> {
  if (!auth.currentUser || !auth.currentUser.emailVerified) return;
  assertValidId(uid);
  const path = `users/${uid}`;
  const safePatch: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (patch.displayName !== undefined) safePatch.displayName = patch.displayName.slice(0, 80);
  if (patch.language !== undefined) safePatch.language = patch.language;
  if (patch.theme !== undefined) safePatch.theme = patch.theme;
  if (patch.defaultReciterId !== undefined) safePatch.defaultReciterId = Math.max(1, Math.min(10000, Math.round(patch.defaultReciterId)));
  if (patch.streakDays !== undefined) safePatch.streakDays = Math.max(0, Math.round(patch.streakDays));
  if (patch.lastReadPage !== undefined) safePatch.lastReadPage = Math.max(1, Math.min(604, Math.round(patch.lastReadPage)));
  if (patch.lastReadSurah !== undefined) safePatch.lastReadSurah = Math.max(1, Math.min(114, Math.round(patch.lastReadSurah)));
  if (patch.lastReadAyah !== undefined) safePatch.lastReadAyah = Math.max(1, Math.min(286, Math.round(patch.lastReadAyah)));
  if (patch.lastReadDate !== undefined) safePatch.lastReadDate = patch.lastReadDate.slice(0, 32);
  if (patch.khatmaTargetDays !== undefined) safePatch.khatmaTargetDays = Math.max(1, Math.min(365, Math.round(patch.khatmaTargetDays)));
  if (patch.khatmaCurrentPage !== undefined) safePatch.khatmaCurrentPage = Math.max(0, Math.min(604, Math.round(patch.khatmaCurrentPage)));
  if (patch.khatmaStartDate !== undefined) safePatch.khatmaStartDate = patch.khatmaStartDate.slice(0, 32);
  if (patch.weeklyPages !== undefined && patch.weeklyPages.length === 7) {
    safePatch.weeklyPages = patch.weeklyPages.map((n) => Math.max(0, Math.round(n)));
  }

  try {
    await updateDoc(doc(db, 'users', uid), safePatch);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function fetchUserBookmarks(uid: string): Promise<VerseBookmark[]> {
  if (!auth.currentUser) return [];
  assertValidId(uid);
  const path = `users/${uid}/bookmarks`;
  try {
    const q = query(collection(db, 'users', uid, 'bookmarks'), where('uid', '==', uid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        uid: String(data.uid),
        verseKey: String(data.verseKey),
        surahNumber: Number(data.surahNumber),
        ayahNumber: Number(data.ayahNumber),
        pageNumber: Number(data.pageNumber),
        highlightColor: data.highlightColor || 'none',
        note: data.note ? String(data.note) : '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function upsertVerseBookmark(uid: string, item: VerseBookmark): Promise<void> {
  if (!auth.currentUser || !auth.currentUser.emailVerified) return;
  assertValidId(uid);
  const docId = item.verseKey.replace(':', '_');
  assertValidId(docId);
  const path = `users/${uid}/bookmarks/${docId}`;
  const ref = doc(db, 'users', uid, 'bookmarks', docId);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        highlightColor: item.highlightColor,
        note: (item.note || '').slice(0, 1000),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        uid,
        verseKey: item.verseKey,
        surahNumber: item.surahNumber,
        ayahNumber: item.ayahNumber,
        pageNumber: item.pageNumber,
        highlightColor: item.highlightColor,
        note: (item.note || '').slice(0, 1000),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function removeVerseBookmark(uid: string, verseKey: string): Promise<void> {
  if (!auth.currentUser) return;
  assertValidId(uid);
  const docId = verseKey.replace(':', '_');
  assertValidId(docId);
  const path = `users/${uid}/bookmarks/${docId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'bookmarks', docId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function fetchMemorizationItems(uid: string): Promise<MemorizationItem[]> {
  if (!auth.currentUser) return [];
  assertValidId(uid);
  const path = `users/${uid}/memorization`;
  try {
    const q = query(collection(db, 'users', uid, 'memorization'), where('uid', '==', uid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        uid: String(data.uid),
        surahNumber: Number(data.surahNumber),
        startAyah: Number(data.startAyah),
        endAyah: Number(data.endAyah),
        repetitions: Number(data.repetitions),
        easeFactor: Number(data.easeFactor),
        intervalDays: Number(data.intervalDays),
        nextReviewDate: String(data.nextReviewDate),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function upsertMemorizationItem(uid: string, item: MemorizationItem): Promise<void> {
  if (!auth.currentUser || !auth.currentUser.emailVerified) return;
  assertValidId(uid);
  assertValidId(item.id);
  const path = `users/${uid}/memorization/${item.id}`;
  const ref = doc(db, 'users', uid, 'memorization', item.id);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        repetitions: item.repetitions,
        easeFactor: item.easeFactor,
        intervalDays: item.intervalDays,
        nextReviewDate: item.nextReviewDate.slice(0, 32),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        uid,
        surahNumber: item.surahNumber,
        startAyah: item.startAyah,
        endAyah: item.endAyah,
        repetitions: item.repetitions,
        easeFactor: item.easeFactor,
        intervalDays: item.intervalDays,
        nextReviewDate: item.nextReviewDate.slice(0, 32),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchFavoriteRadios(uid: string): Promise<FavoriteRadio[]> {
  if (!auth.currentUser) return [];
  assertValidId(uid);
  const path = `users/${uid}/favoriteRadios`;
  try {
    const q = query(collection(db, 'users', uid, 'favoriteRadios'), where('uid', '==', uid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        uid: String(data.uid),
        radioId: Number(data.radioId),
        name: String(data.name),
        url: String(data.url),
        createdAt: new Date().toISOString(),
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function toggleFavoriteRadioRemote(
  uid: string,
  radio: { id: number; name: string; url: string },
  exists: boolean
): Promise<void> {
  if (!auth.currentUser || !auth.currentUser.emailVerified) return;
  assertValidId(uid);
  const docId = `radio_${radio.id}`;
  assertValidId(docId);
  const path = `users/${uid}/favoriteRadios/${docId}`;
  const ref = doc(db, 'users', uid, 'favoriteRadios', docId);
  try {
    if (exists) {
      await deleteDoc(ref);
    } else {
      await setDoc(ref, {
        uid,
        radioId: radio.id,
        name: radio.name.slice(0, 120),
        url: radio.url.slice(0, 300),
        createdAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export const ROOT_ADMIN_EMAIL = 'ywsfkrt300@gmail.com';

export const DEFAULT_APP_APPEARANCE: AppAppearance = {
  backgroundType: 'default_mosque',
  backgroundUrl: '/src/assets/images/mosque_backdrop.png',
  backgroundOpacity: 0.26,
  backgroundBlur: 0,
};

export function sanitizeAppearanceUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return trimmed.slice(0, 2048);
  }
  if (/^https:\/\/[^\s]+$/i.test(trimmed)) {
    return trimmed.slice(0, 2048);
  }
  if (/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/i.test(trimmed)) {
    return trimmed.slice(0, 400000);
  }
  return '';
}

export function subscribeToAppAppearance(cb: (appearance: AppAppearance) => void): () => void {
  let cancelled = false;
  void fetchFirestoreRestAppearance().then((restAppearance) => {
    if (!cancelled && restAppearance) {
      cb(restAppearance);
    }
  });

  const ref = doc(db, 'appConfig', 'appearance');
  const unsub = onSnapshot(
    ref,
    (snap) => {
      if (cancelled) return;
      if (!snap.exists()) {
        cb(DEFAULT_APP_APPEARANCE);
        return;
      }
      const d = snap.data();
      const safeUrl = sanitizeAppearanceUrl(String(d.backgroundUrl || ''));
      cb({
        backgroundType: d.backgroundType || 'default_mosque',
        backgroundUrl: safeUrl || (d.backgroundType === 'none' ? '' : DEFAULT_APP_APPEARANCE.backgroundUrl),
        backgroundOpacity: Math.min(0.9, Math.max(0.05, Number(d.backgroundOpacity ?? 0.26))),
        backgroundBlur: Math.min(24, Math.max(0, Math.round(Number(d.backgroundBlur ?? 0)))),
        updatedBy: d.updatedBy ? String(d.updatedBy) : undefined,
        updatedAt: d.updatedAt instanceof Timestamp ? d.updatedAt.toDate().toISOString() : undefined,
      });
    },
    (error) => {
      console.warn('Appearance subscription warning:', error);
    }
  );
  return () => {
    cancelled = true;
    unsub();
  };
}

export async function updateAppAppearance(appearance: AppAppearance): Promise<void> {
  if (!auth.currentUser || !auth.currentUser.emailVerified) {
    throw new Error('Verified admin authentication required');
  }
  const path = 'appConfig/appearance';
  const safeUrl = appearance.backgroundType === 'none' ? '' : sanitizeAppearanceUrl(appearance.backgroundUrl);
  if (appearance.backgroundType !== 'none' && !safeUrl) {
    throw new Error('Invalid image URL or unsupported file format');
  }
  const payload = {
    backgroundType: appearance.backgroundType,
    backgroundUrl: safeUrl,
    backgroundOpacity: Math.min(0.9, Math.max(0.05, Number(appearance.backgroundOpacity))),
    backgroundBlur: Math.min(24, Math.max(0, Math.round(Number(appearance.backgroundBlur)))),
    updatedBy: auth.currentUser.uid,
    updatedAt: serverTimestamp(),
  };
  try {
    await setDoc(doc(db, 'appConfig', 'appearance'), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function checkIsAdmin(user: User | null): Promise<boolean> {
  if (!user || !user.emailVerified) return false;
  if (user.email === ROOT_ADMIN_EMAIL) return true;
  try {
    assertValidId(user.uid);
    const snap = await getDoc(doc(db, 'admins', user.uid));
    return snap.exists();
  } catch {
    return false;
  }
}

function inferRegionFallback(): { country: string; countryCode: string; city: string } {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  const tzCity = tz.includes('/') ? tz.split('/').pop()?.replace(/_/g, ' ') || '' : '';
  const tzMap: Record<string, { country: string; code: string }> = {
    'Asia/Riyadh': { country: 'Saudi Arabia', code: 'SA' },
    'Asia/Dubai': { country: 'United Arab Emirates', code: 'AE' },
    'Asia/Kuwait': { country: 'Kuwait', code: 'KW' },
    'Asia/Qatar': { country: 'Qatar', code: 'QA' },
    'Asia/Bahrain': { country: 'Bahrain', code: 'BH' },
    'Asia/Muscat': { country: 'Oman', code: 'OM' },
    'Asia/Amman': { country: 'Jordan', code: 'JO' },
    'Asia/Baghdad': { country: 'Iraq', code: 'IQ' },
    'Asia/Beirut': { country: 'Lebanon', code: 'LB' },
    'Asia/Damascus': { country: 'Syria', code: 'SY' },
    'Asia/Gaza': { country: 'Palestine', code: 'PS' },
    'Africa/Cairo': { country: 'Egypt', code: 'EG' },
    'Africa/Casablanca': { country: 'Morocco', code: 'MA' },
    'Africa/Algiers': { country: 'Algeria', code: 'DZ' },
    'Africa/Tunis': { country: 'Tunisia', code: 'TN' },
    'Africa/Tripoli': { country: 'Libya', code: 'LY' },
    'Africa/Khartoum': { country: 'Sudan', code: 'SD' },
    'Europe/Istanbul': { country: 'Turkey', code: 'TR' },
    'Asia/Jakarta': { country: 'Indonesia', code: 'ID' },
    'Asia/Kuala_Lumpur': { country: 'Malaysia', code: 'MY' },
    'Asia/Karachi': { country: 'Pakistan', code: 'PK' },
    'Europe/London': { country: 'United Kingdom', code: 'GB' },
    'Europe/Paris': { country: 'France', code: 'FR' },
    'Europe/Berlin': { country: 'Germany', code: 'DE' },
  };
  if (tzMap[tz]) {
    return { country: tzMap[tz].country, countryCode: tzMap[tz].code, city: tzCity };
  }
  const localeParts = (navigator.language || 'ar-SA').split('-');
  const code = (localeParts[1] || 'XX').toUpperCase().slice(0, 4);
  return { country: tzCity || 'Global', countryCode: code.length >= 2 ? code : 'XX', city: tzCity };
}

async function resolveGeoLocation(): Promise<{ country: string; countryCode: string; city: string }> {
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 2800);
    const res = await fetch('https://get.geojs.io/v1/ip/geo.json', { signal: controller.signal });
    window.clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      if (data?.country && data?.country_code) {
        return {
          country: String(data.country).slice(0, 80),
          countryCode: String(data.country_code).toUpperCase().slice(0, 8),
          city: String(data.city || '').slice(0, 80),
        };
      }
    }
  } catch {
    // Fallback to next provider
  }

  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 2800);
    const res = await fetch('https://ipwho.is/?fields=country,country_code,city', { signal: controller.signal });
    window.clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      if (data?.country && data?.country_code) {
        return {
          country: String(data.country).slice(0, 80),
          countryCode: String(data.country_code).toUpperCase().slice(0, 8),
          city: String(data.city || '').slice(0, 80),
        };
      }
    }
  } catch {
    // Fallback to timezone-based region
  }

  return inferRegionFallback();
}

export async function recordSiteVisit(lang: Language): Promise<void> {
  try {
    if (sessionStorage.getItem('nour_visit_logged') === '1') return;
    sessionStorage.setItem('nour_visit_logged', '1');

    const w = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const deviceType: 'mobile' | 'tablet' | 'desktop' =
      w < 768 ? 'mobile' : w < 1024 ? 'tablet' : 'desktop';

    const geo = await resolveGeoLocation();
    const visitId = `v_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const rawPath = (typeof window !== 'undefined' ? window.location.pathname : '/') || '/';

    await setDoc(doc(db, 'visits', visitId), {
      visitId,
      country: geo.country || 'Unknown',
      countryCode: geo.countryCode.length >= 2 ? geo.countryCode : 'XX',
      city: geo.city || '',
      deviceType,
      language: lang,
      path: rawPath.slice(0, 120),
      createdAt: serverTimestamp(),
    });
  } catch {
    // Non-blocking telemetry: allow reading/listening even if blocked offline
  }
}

export async function fetchAdminAnalytics(): Promise<{
  visits: VisitRecord[];
  totalRegisteredUsers: number;
}> {
  if (!auth.currentUser || !auth.currentUser.emailVerified) {
    throw new Error('Admin verification required');
  }
  const visitsPath = 'visits';
  try {
    const [visitsSnap, usersSnap] = await Promise.all([
      getDocs(query(collection(db, 'visits'), orderBy('createdAt', 'desc'), limit(500))),
      getDocs(query(collection(db, 'users'), limit(500))),
    ]);

    const visits: VisitRecord[] = visitsSnap.docs.map((d) => {
      const data = d.data();
      const ts = data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : new Date().toISOString();
      return {
        visitId: String(data.visitId || d.id),
        country: String(data.country || 'Unknown'),
        countryCode: String(data.countryCode || 'XX'),
        city: String(data.city || ''),
        deviceType: data.deviceType === 'mobile' || data.deviceType === 'tablet' ? data.deviceType : 'desktop',
        language: data.language === 'en' ? 'en' : 'ar',
        path: String(data.path || '/'),
        createdAt: ts,
      };
    });

    return {
      visits,
      totalRegisteredUsers: usersSnap.size,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, visitsPath);
  }
}

export async function deleteVisitRecord(visitId: string): Promise<void> {
  if (!auth.currentUser || !auth.currentUser.emailVerified) {
    throw new Error('Admin verification required');
  }
  assertValidId(visitId);
  const path = `visits/${visitId}`;
  try {
    await deleteDoc(doc(db, 'visits', visitId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function fetchAdminUsersList(): Promise<RegisteredUserSummary[]> {
  if (!auth.currentUser || !auth.currentUser.emailVerified) {
    throw new Error('Admin verification required');
  }
  const path = 'users';
  try {
    const snap = await getDocs(query(collection(db, 'users'), limit(300)));
    return snap.docs
      .map((d) => {
        const data = d.data();
        const createdAt =
          data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : undefined;
        return {
          uid: String(data.uid || d.id),
          displayName: String(data.displayName || 'مستخدم نور'),
          email: data.email ? String(data.email) : undefined,
          language: data.language === 'en' ? 'en' : 'ar',
          streakDays: Number(data.streakDays || 0),
          lastReadPage: Number(data.lastReadPage || 1),
          khatmaCurrentPage: Number(data.khatmaCurrentPage || 1),
          khatmaTargetDays: Number(data.khatmaTargetDays || 30),
          createdAt,
        } satisfies RegisteredUserSummary;
      })
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function fetchAdminRoles(): Promise<AdminRoleRecord[]> {
  if (!auth.currentUser || !auth.currentUser.emailVerified) {
    throw new Error('Admin verification required');
  }
  const path = 'admins';
  try {
    const snap = await getDocs(collection(db, 'admins'));
    return snap.docs.map((d) => {
      const data = d.data();
      const createdAt =
        data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : new Date().toISOString();
      return {
        uid: String(data.uid || d.id),
        email: String(data.email || ''),
        addedBy: String(data.addedBy || ''),
        createdAt,
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function addAdminRole(uid: string, email: string): Promise<void> {
  if (!auth.currentUser || !auth.currentUser.emailVerified) {
    throw new Error('Verified root admin authentication required');
  }
  const cleanUid = uid.trim();
  const cleanEmail = email.trim().toLowerCase();
  assertValidId(cleanUid);
  if (!cleanEmail || !cleanEmail.includes('@') || cleanEmail.length > 160) {
    throw new Error('Invalid email address');
  }
  const path = `admins/${cleanUid}`;
  try {
    await setDoc(doc(db, 'admins', cleanUid), {
      uid: cleanUid,
      email: cleanEmail,
      addedBy: auth.currentUser.uid,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function removeAdminRole(uid: string): Promise<void> {
  if (!auth.currentUser || !auth.currentUser.emailVerified) {
    throw new Error('Verified root admin authentication required');
  }
  assertValidId(uid);
  const path = `admins/${uid}`;
  try {
    await deleteDoc(doc(db, 'admins', uid));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}


