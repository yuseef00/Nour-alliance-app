import { Capacitor, PluginListenerHandle, registerPlugin } from '@capacitor/core';

export type NativeMediaActionType = 'toggle' | 'prev' | 'next' | 'stop' | 'seek';
export type NativeAthanActionType = 'stop' | 'stop_flip';
export type NativePrayerActionType = 'refresh';

export interface NativePinnedPrayerBarOptions {
  title: string;
  body: string;
  subText?: string;
  summaryText?: string;
  refreshLabel?: string;
  stopAthanLabel?: string;
  showStopAthan?: boolean;
}

interface NourNativePluginInterface {
  showPinnedPrayerNotification(options: NativePinnedPrayerBarOptions): Promise<void>;
  clearPinnedPrayerNotification(): Promise<void>;
  stopNativeAthanNotification(): Promise<void>;
  setAthanFlipMonitor(options: { active: boolean; enabled: boolean }): Promise<void>;
  syncMediaPlayback(options: {
    active: boolean;
    playing: boolean;
    canSkip: boolean;
    title: string;
    subtitle: string;
    album?: string;
    artworkPath?: string;
    positionMs?: number;
    durationMs?: number;
  }): Promise<void>;
  addListener(
    eventName: 'mediaAction',
    listenerFunc: (event: { action?: NativeMediaActionType; seekMs?: number }) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'athanAction',
    listenerFunc: (event: { action?: NativeAthanActionType }) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'prayerAction',
    listenerFunc: (event: { action?: NativePrayerActionType }) => void
  ): Promise<PluginListenerHandle>;
}

const NourNative = registerPlugin<NourNativePluginInterface>('NourNative');

export async function showNativePinnedPrayerBar(
  options: NativePinnedPrayerBarOptions
): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    await NourNative.showPinnedPrayerNotification(options);
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

export async function stopNativeAthanNotification(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await NourNative.stopNativeAthanNotification();
  } catch {
    // ignore native notification cancel warnings
  }
}

export async function setNativeAthanFlipMonitor(active: boolean, enabled: boolean): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await NourNative.setAthanFlipMonitor({ active, enabled });
  } catch {
    // ignore sensor monitor errors on restricted devices
  }
}

export async function syncNativeMediaPlayback(options: {
  active: boolean;
  playing: boolean;
  canSkip: boolean;
  title: string;
  subtitle: string;
  album?: string;
  artworkPath?: string;
  positionMs?: number;
  durationMs?: number;
}): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await NourNative.syncMediaPlayback(options);
  } catch {
    // ignore foreground service bridge warnings
  }
}

export function addNativeMediaActionListener(
  callback: (action: NativeMediaActionType, seekMs?: number) => void
): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};
  let handle: PluginListenerHandle | null = null;
  let cancelled = false;

  void NourNative.addListener('mediaAction', (event) => {
    if (!cancelled && event?.action) {
      callback(event.action, event.seekMs);
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

export function addNativeAthanActionListener(
  callback: (action: NativeAthanActionType) => void
): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};
  let handle: PluginListenerHandle | null = null;
  let cancelled = false;

  void NourNative.addListener('athanAction', (event) => {
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

export function addNativePrayerActionListener(
  callback: (action: NativePrayerActionType) => void
): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};
  let handle: PluginListenerHandle | null = null;
  let cancelled = false;

  void NourNative.addListener('prayerAction', (event) => {
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
