// Class & Group Management — system notifications on the phone itself.
//
// Two layers, because browsers differ:
//
//   1. Web Push. Where the platform allows it, a real push arrives even when the
//      app is closed and the service worker draws it. That needs the server to
//      hold a subscription (see the route note below), so the client registers
//      the subscription and hands it over whenever it can.
//
//   2. Foreground/last-known notices. On iPhone (Safari 16.4+ only delivers
//      push to an INSTALLED app) and anywhere push is refused, the portal still
//      raises a real system notification through the service worker for things
//      that happen while it is open, and the in-app list remains the record.
//
// Everything here is best-effort and never blocks sign-in: a student who denies
// permission simply keeps the in-app notices they already had.

const ASKED_KEY = 'codeRx_cgmNotifyAskedAt';
const PUSH_FLAG = 'codeRx_cgmPushOn';

export type NotifySupport = 'push' | 'local' | 'unsupported';

export const notifySupport = (): NotifySupport => {
  if (typeof window === 'undefined') return 'unsupported';
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return 'unsupported';
  // PushManager is the true "can receive while closed" marker; iOS installed
  // apps expose it only when launched from the home screen.
  return 'PushManager' in window ? 'push' : 'local';
};

export const notificationPermission = (): NotificationPermission | 'unsupported' => {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
};

/** True when the app was launched as an installed app, not a browser tab. */
export const isInstalledApp = (): boolean => {
  if (typeof window === 'undefined') return false;
  const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches;
  return Boolean(standalone) || Boolean((navigator as any).standalone);
};

export const isProbablyIos = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // iPad reports as Macintosh on iOS 13+.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document);
};

const serviceWorkerRegistration = async (): Promise<ServiceWorkerRegistration | null> => {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.getRegistration('/') || await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
};

/**
 * Draw a notification through the service worker (so it carries the app icon
 * and survives the tab losing focus). Falls back to the constructor where no
 * worker is registered — e.g. a dev server without the SW.
 */
export const showSystemNotification = async (
  title: string,
  body: string,
  link?: string | null,
): Promise<boolean> => {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;
  const registration = await serviceWorkerRegistration();
  if (registration && 'showNotification' in registration) {
    try {
      await registration.showNotification(title, {
        body,
        icon: '/CODE%20RX11.png',
        badge: '/CODE%20RX11.png',
        tag: link ? `code-rx:${link}` : 'code-rx-notice',
        data: { link: link || '#class-groups/student/notifications' },
      } as NotificationOptions);
      return true;
    } catch { /* fall through to the constructor */ }
  }
  try {
    const notice = new Notification(title, { body, icon: '/CODE%20RX11.png' });
    if (link) notice.onclick = () => { window.location.hash = link; window.focus(); notice.close(); };
    return true;
  } catch {
    return false;
  }
};

const urlBase64ToBuffer = (value: string): ArrayBuffer => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
};

/**
 * Register this device for real push, using the server's own VAPID key.
 * Returns whether the device is now subscribed — false simply means this
 * deployment has no push keys configured, or the browser said no.
 */
export const subscribeToPush = async (
  fetchKey: () => Promise<{ publicKey: string | null; enabled: boolean }>,
  save: (subscription: any) => Promise<any>,
): Promise<boolean> => {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  try {
    const registration = await navigator.serviceWorker.getRegistration('/') || await navigator.serviceWorker.ready;
    if (!registration || !('pushManager' in registration)) return false;
    let key: { publicKey: string | null; enabled: boolean } | null = null;
    try { key = await fetchKey(); } catch { return false; }
    if (!key?.enabled || !key.publicKey) return false;
    const existing = await registration.pushManager.getSubscription();
    const subscription = existing || await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToBuffer(key.publicKey),
    });
    await save(subscription.toJSON());
    return true;
  } catch {
    // A refused subscription is not a broken app — the in-app list still works.
    return false;
  }
};

/** Ask once, on a deliberate press — never on page load. */
export const requestNotificationPermission = async (): Promise<NotificationPermission | 'unsupported'> => {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  try { localStorage.setItem(ASKED_KEY, new Date().toISOString()); } catch { /* private mode */ }
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  try { return await Notification.requestPermission(); } catch { return Notification.permission; }
};

export const hasBeenAsked = (): boolean => {
  try { return Boolean(localStorage.getItem(ASKED_KEY)); } catch { return false; }
};

export const isPushEnabled = (): boolean => {
  try { return localStorage.getItem(PUSH_FLAG) === 'on'; } catch { return false; }
};

export const setPushEnabled = (on: boolean) => {
  try {
    if (on) localStorage.setItem(PUSH_FLAG, 'on');
    else localStorage.removeItem(PUSH_FLAG);
  } catch { /* private mode */ }
};
