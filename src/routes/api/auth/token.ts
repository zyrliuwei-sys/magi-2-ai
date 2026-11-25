import { createFileRoute } from '@tanstack/react-router';

import { getAuth, getAuthCookiePrefix } from '@/core/auth';
import { getAllConfigs } from '@/modules/config/service';
import { getCookieFromHeader } from '@/lib/cookie';
import { enforceMinIntervalRateLimit } from '@/lib/rate-limit';
import { isAllowedAppProtocolUrl } from '@/lib/redirect';
import { respData, respErr } from '@/lib/resp';

const noStore = { 'Cache-Control': 'private, no-store' };
const limit = { intervalMs: 1000, keyPrefix: 'desktop-token' };

function fail(message: string, status: number) {
  return respErr(message, { status, headers: noStore });
}

/**
 * Issue a desktop hand-off only to this site's signed-in callback page.
 */
async function POST({ request }: { request: Request }) {
  const ipLimit = enforceMinIntervalRateLimit(request, limit);
  if (ipLimit) return ipLimit;
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return fail('Same-origin request required', 403);

  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) return fail('Unauthorized', 401);

    const userLimit = enforceMinIntervalRateLimit(request, {
      ...limit,
      extraKey: session.user.id,
    });
    if (userLimit) return userLimit;

    const body = await request.json().catch(() => null);
    const target = body?.redirect;
    if (typeof target !== 'string' || target.length > 2048)
      return fail('Invalid desktop redirect', 400);

    const configs = await getAllConfigs();
    if (!isAllowedAppProtocolUrl(target, configs.desktop_auth_schemes))
      return fail('Desktop hand-off is unavailable', 403);

    const cookies = request.headers.get('cookie');
    const name = `${getAuthCookiePrefix()}.session_token`;
    const token =
      getCookieFromHeader(cookies, `__Secure-${name}`) ??
      getCookieFromHeader(cookies, name);
    if (!token) return fail('No session token found', 401);

    return respData({ token: decodeURIComponent(token) }, { headers: noStore });
  } catch {
    return fail('Could not complete desktop hand-off', 500);
  }
}

export const Route = createFileRoute('/api/auth/token')({
  server: {
    handlers: { POST },
  },
});
