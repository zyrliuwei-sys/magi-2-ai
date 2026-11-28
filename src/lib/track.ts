import type { ClientEventKind, EventDetail } from '@/config/events';
import type { VideoMode } from '@/config/magi-video';

const pendingPaywallKey = 'magi-video-paywall';

/**
 * Report a product event from the browser, e.g.
 * `track('paywall_hit', { feature: 'hd_export' })`. The kind must be
 * registered with `client: true` in src/config/events.ts.
 *
 * Fire-and-forget: never throws, never blocks, and survives a navigation
 * that follows right after (keepalive). Signed-out visitors are ignored by
 * the server.
 */
export function track(kind: ClientEventKind, detail?: EventDetail): void {
  if (typeof window === 'undefined') return;
  try {
    void fetch(`/api/events?kind=${encodeURIComponent(kind)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, detail }),
      keepalive: true,
      credentials: 'same-origin',
    }).catch(() => {});
  } catch {
    // tracking must never break the page
  }
}

export function trackVideoPaywall(mode: VideoMode, signedIn: boolean) {
  if (signedIn) {
    track('paywall_hit', { feature: 'video_generation', mode });
    return;
  }
  try {
    sessionStorage.setItem(pendingPaywallKey, mode);
  } catch {
    // Signed-out visits may have browser storage disabled.
  }
}

export function flushVideoPaywall() {
  try {
    const mode = sessionStorage.getItem(pendingPaywallKey);
    if (!mode) return;
    sessionStorage.removeItem(pendingPaywallKey);
    if (mode === 'text-to-video' || mode === 'image-to-video') {
      track('paywall_hit', { feature: 'video_generation', mode });
    }
  } catch {
    // Analytics does not block sign-in or checkout.
  }
}
