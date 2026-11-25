import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  deleteUser,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
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
  AppAppearance,
  FavoriteRadio,
  Language,
  MemorizationItem,
  UserProfile,
  VerseBookmark,
  VisitRecord,
} from '../types/nour';

const app = initializeApp(firebaseConfig);

function createPersistentDb() {
  try {
    return initializeFirestore(
      app,
      {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      },
      firebaseConfig.firestoreDatabaseId
    );
  } catch {
    return getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
}

export const db = createPersistentDb();
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

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

export async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

testConnection();

export function subscribeToAuth(cb: (user: User | null) => void) {
  return onAuthStateChanged(auth, cb);
}

export async function signInGoogle() {
  return signInWithPopup(auth, googleProvider);
}

export async function signInEmail(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function signUpEmail(name: string, email: string, password: string) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: name });
  await sendEmailVerification(cred.user);
  return cred;
}

export async function resendVerificationEmail() {
  if (auth.currentUser) {
    await sendEmailVerification(auth.currentUser);
  }
}

export async function reloadCurrentUser(): Promise<User | null> {
  if (!auth.currentUser) return null;
  await auth.currentUser.reload();
  return auth.currentUser;
}

export function mapFirebaseAuthError(err: unknown, lang: Language): string {
  const code = (err as { code?: string })?.code || '';
  const msg = err instanceof Error ? err.message : String(err);

  if (code === 'auth/operation-not-allowed' || msg.includes('operation-not-allowed')) {
    return lang === 'ar'
      ? 'تسجيل الحساب بالبريد غير مفعّل بعد في Firebase Console (Authentication ← Sign-in method ← Email/Password). يمكنك المتابعة عبر Google أو كضيف الآن.'
      : 'Email/Password sign-up is not enabled yet in Firebase Console (Authentication -> Sign-in method -> Email/Password). You can use Google or Continue as Guest.';
  }
  if (code === 'auth/email-already-in-use' || msg.includes('email-already-in-use')) {
    return lang === 'ar'
      ? 'هذا البريد الإلكتروني مسجل مسبقاً. يرجى تسجيل الدخول بدلاً من ذلك.'
      : 'This email is already registered. Please sign in instead.';
  }
  if (code === 'auth/weak-password' || msg.includes('weak-password')) {
    return lang === 'ar'
      ? 'كلمة المرور ضعيفة، يجب أن تتكون من ٦ أحرف على الأقل.'
      : 'Password is too weak. Please use at least 6 characters.';
  }
  if (code === 'auth/invalid-email' || msg.includes('invalid-email')) {
    return lang === 'ar' ? 'صيغة البريد الإلكتروني غير صحيحة.' : 'Please enter a valid email address.';
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
  if (code === 'auth/too-many-requests' || msg.includes('too-many-requests')) {
    return lang === 'ar'
      ? 'محاولات كثيرة متتالية، يرجى الانتظار قليلاً ثم المحاولة مجدداً.'
      : 'Too many attempts. Please wait a moment and try again.';
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

export async function resetPasswordEmail(email: string) {
  return sendPasswordResetEmail(auth, email);
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
  const path = 'appConfig/appearance';
  const ref = doc(db, 'appConfig', 'appearance');
  return onSnapshot(
    ref,
    (snap) => {
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
      cb(DEFAULT_APP_APPEARANCE);
    }
  );
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

