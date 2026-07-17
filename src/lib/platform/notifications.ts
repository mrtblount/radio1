/**
 * Web Push client plumbing. Alerts reach a phone with the screen off only via
 * an installed PWA (iOS requires Home-Screen install; Android strongly
 * prefers it) — the Settings UI explains this per platform.
 */
import { convexClient } from "../convexClient";
import { api } from "../../../convex/_generated/api";
import { getUserId, loadAccessCode } from "./identity";

export type PushSetupResult =
  | "subscribed"
  | "denied"
  | "needs-install"
  | "unsupported"
  | "error";

const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

export function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window;
}

/** iOS Safari only exposes push to installed PWAs. */
export function needsInstallFirst(): boolean {
  return IS_IOS && !isStandalone();
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function enablePush(): Promise<PushSetupResult> {
  if (!pushSupported()) {
    return needsInstallFirst() ? "needs-install" : "unsupported";
  }
  if (needsInstallFirst()) return "needs-install";
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return "denied";

    const registration = await navigator.serviceWorker.ready;
    const key = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
    if (!key) return "error";
    const sub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key).buffer as ArrayBuffer,
    });
    const json = sub.toJSON();
    const code = loadAccessCode();
    await convexClient.mutation(api.push.subscribe, {
      userId: getUserId(),
      endpoint: sub.endpoint,
      p256dh: json.keys?.p256dh ?? "",
      auth: json.keys?.auth ?? "",
      ua: navigator.userAgent.slice(0, 120),
      ...(code ? { accessCode: code } : {}),
    });
    return "subscribed";
  } catch (err) {
    console.warn("[push] enable failed", err);
    return "error";
  }
}

export async function disablePush(): Promise<void> {
  try {
    const registration = await navigator.serviceWorker.ready;
    const sub = await registration.pushManager.getSubscription();
    const code = loadAccessCode();
    await convexClient.mutation(api.push.unsubscribe, {
      userId: getUserId(),
      endpoint: sub?.endpoint,
      ...(code ? { accessCode: code } : {}),
    });
    await sub?.unsubscribe();
  } catch (err) {
    console.warn("[push] disable failed", err);
  }
}

/** App-icon badge (best effort; Chromium + installed PWAs). */
export function setAppBadge(count: number): void {
  const nav = navigator as {
    setAppBadge?: (n: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  if (count > 0) void nav.setAppBadge?.(count).catch(() => {});
  else void nav.clearAppBadge?.().catch(() => {});
}
