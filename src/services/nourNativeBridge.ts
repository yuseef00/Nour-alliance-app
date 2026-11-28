import { Capacitor, PluginListenerHandle, registerPlugin } from '@capacitor/core';

export type NativeMediaActionType = 'toggle' | 'prev' | 'next' | 'stop';

interface NourNativePluginInterface {
  showPinnedPrayerNotification(options: { title: string; body: string }): Promise<void>;
  clearPinnedPrayerNotification(): Promise<void>;
  syncMediaPlayback(options: {
    active: boolean;
    playing: boolean;
    canSkip: boolean;
    title: string;
    subtitle: string;
  }): Promise<void>;
  addListener(
    eventName: 'mediaAction',
    listenerFunc: (event: { action?: NativeMediaActionType }) => void
  ): Promise<PluginListenerHandle>;
}

const NourNative = registerPlugin<NourNativePluginInterface>('NourNative');

export async function showNativePinnedPrayerBar(title: string, body: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    await NourNative.showPinnedPrayerNotification({ title, body });
    return true;
  } catch {
    return false;
  }
}

export async function clearNativePinnedPrayerBar(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await NourNative.clearPinnedPrayerNotification();
  } catch {
    // ignore native cleanup errors
  }
}

export async function syncNativeMediaPlayback(options: {
  active: boolean;
  playing: boolean;
  canSkip: boolean;
  title: string;
  subtitle: string;
}): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await NourNative.syncMediaPlayback(options);
  } catch {
    // ignore foreground service bridge warnings
  }
}

export function addNativeMediaActionListener(
  callback: (action: NativeMediaActionType) => void
): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};
  let handle: PluginListenerHandle | null = null;
  let cancelled = false;

  void NourNative.addListener('mediaAction', (event) => {
    if (!cancelled && event?.action) {
      callback(event.action);
    }
  })
    .then((h) => {
      if (cancelled) {
        void h.remove();
      } else {
        handle = h;
      }
    })
    .catch(() => {});

  return () => {
    cancelled = true;
    if (handle) {
      void handle.remove();
      handle = null;
    }
  };
}
