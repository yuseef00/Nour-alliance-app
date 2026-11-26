export const USER_STORAGE_UPDATED_EVENT = 'nour_user_storage_updated';

export type UserScopedKey =
  | 'state_v2'
  | 'last_listened'
  | 'search_history'
  | 'fav_reciters'
  | 'adhkar_counts'
  | 'tasbih_state'
  | 'notif_enabled';

const LEGACY_GUEST_STATE_KEY = 'nour_guest_state_v1';

export function normalizeAccountId(uid?: string | null): string {
  const clean = (uid || '').trim();
  return clean && clean !== 'guest' ? clean : 'guest';
}

export function getUserScopedKey(uid: string | null | undefined, key: UserScopedKey): string {
  return `nour_acct_${normalizeAccountId(uid)}_${key}`;
}

export function readUserScoped<T>(uid: string | null | undefined, key: UserScopedKey, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const scopedKey = getUserScopedKey(uid, key);
    const raw = localStorage.getItem(scopedKey);
    if (raw !== null) {
      return JSON.parse(raw) as T;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

export function writeUserScoped<T>(uid: string | null | undefined, key: UserScopedKey, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    const scopedKey = getUserScopedKey(uid, key);
    localStorage.setItem(scopedKey, JSON.stringify(value));
    window.dispatchEvent(
      new CustomEvent(USER_STORAGE_UPDATED_EVENT, {
        detail: { uid: normalizeAccountId(uid), key },
      })
    );
  } catch {
    // ignore storage quota errors
  }
}

/**
 * One-time safe migration of legacy guest state strictly into the 'guest' namespace.
 * Never migrates legacy data into signed-in Firebase accounts so every user stays isolated.
 */
export function migrateLegacyGuestStorageOnce(): void {
  if (typeof window === 'undefined') return;
  try {
    const guestStateKey = getUserScopedKey('guest', 'state_v2');
    if (localStorage.getItem(guestStateKey) === null) {
      const legacyRaw = localStorage.getItem(LEGACY_GUEST_STATE_KEY);
      if (legacyRaw) {
        const parsed = JSON.parse(legacyRaw);
        if (parsed?.profile?.uid === 'guest') {
          localStorage.setItem(guestStateKey, legacyRaw);
        }
      }
    }
    // Remove old global keys after checking so they cannot bleed between accounts
    const legacyPairs: Array<[string, UserScopedKey]> = [
      ['nour_search_history', 'search_history'],
      ['nour_fav_reciters_v1', 'fav_reciters'],
      ['nour_adhkar_counts', 'adhkar_counts'],
    ];
    for (const [oldKey, targetKey] of legacyPairs) {
      const guestKey = getUserScopedKey('guest', targetKey);
      const oldVal = localStorage.getItem(oldKey);
      if (oldVal !== null && localStorage.getItem(guestKey) === null) {
        localStorage.setItem(guestKey, oldVal);
      }
      if (oldVal !== null) {
        localStorage.removeItem(oldKey);
      }
    }
    const oldTasbih = localStorage.getItem('nour_tasbih_count');
    if (oldTasbih !== null) {
      const guestTasbihKey = getUserScopedKey('guest', 'tasbih_state');
      if (localStorage.getItem(guestTasbihKey) === null) {
        const count = Number(oldTasbih) || 0;
        localStorage.setItem(guestTasbihKey, JSON.stringify({ count, goal: 33, phraseIdx: 0 }));
      }
      localStorage.removeItem('nour_tasbih_count');
    }
    if (localStorage.getItem(LEGACY_GUEST_STATE_KEY) !== null) {
      localStorage.removeItem(LEGACY_GUEST_STATE_KEY);
    }
  } catch {
    // ignore migration errors
  }
}
