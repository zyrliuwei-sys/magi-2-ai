import { createFileRoute } from '@tanstack/react-router';
import { MultipartTooLargeError, readMultipartForm } from '@/server/multipart';
import {
  listVideoJobs,
  readVideoJob,
  startVideoJob,
  validateReference,
  videoRequestSchema,
  VideoUnavailableError,
} from '@/server/video-jobs';
import { z } from 'zod';

import { getAuth } from '@/core/auth';
import { VIDEO_IMAGE_LIMIT } from '@/config/magi-video';
import { getBalance } from '@/modules/credits/service';
import { enforceMinIntervalRateLimit } from '@/lib/rate-limit';
import { respData, respErr } from '@/lib/resp';
import { m } from '@/paraglide/messages.js';

const noStore = { 'Cache-Control': 'private, no-store' };
const submitLimit = { intervalMs: 1600, keyPrefix: 'video-submit' };
const maxBody = VIDEO_IMAGE_LIMIT + 32 * 1024;

function fail(message: string, status: number) {
  return respErr(message, { status, headers: noStore });
}

async function POST({ request }: { request: Request }) {
  const ipLimit = enforceMinIntervalRateLimit(request, submitLimit);
  if (ipLimit) return ipLimit;
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return fail('Same-origin request required', 403);
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session?.user) return fail(m['video.error.sign_in'](), 401);
  const userLimit = enforceMinIntervalRateLimit(request, {
    ...submitLimit,
    extraKey: session.user.id,
  });
  if (userLimit) return userLimit;
  let form: FormData;
  try {
    form = await readMultipartForm(request, maxBody);
  } catch (error) {
    return error instanceof MultipartTooLargeError
      ? fail(m['video.error.image'](), 413)
      : fail(m['video.error.invalid'](), 400);
  }
  if (form.getAll('image').length > 1 || form.getAll('input').length !== 1)
    return fail(m['video.error.invalid'](), 400);
  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get('input')));
  } catch {
    return fail(m['video.error.invalid'](), 400);
  }
  const input = videoRequestSchema.safeParse(raw);
  if (!input.success) return fail(m['video.error.invalid'](), 400);
  const image =
    input.data.mode === 'image-to-video'
      ? await validateReference(form.get('image'))
      : undefined;
  if (input.data.mode === 'image-to-video' && !image)
    return fail(m['video.error.image'](), 400);

  try {
    const job = await startVideoJob(session.user.id, input.data, image);
    return job
      ? respData(job, { headers: noStore })
      : fail(m['video.error.unavailable'](), 409);
  } catch (error) {
    if (error instanceof VideoUnavailableError)
      return fail(
        error.mode === 'image-to-video'
          ? m['video.error.image_offline']()
          : m['video.error.offline'](),
        503
      );
    if (error instanceof Error && error.message === 'Insufficient credits')
      return fail(m['video.error.credits'](), 402);
    return fail(m['video.error.unavailable'](), 503);
  }
}

async function GET({ request }: { request: Request }) {
  const query = new URL(request.url).searchParams;
  const id = query.get('task');
  const readLimit = {
    intervalMs: 1600,
    keyPrefix: id ? 'video-status' : 'video-history',
  };
  const ipLimit = enforceMinIntervalRateLimit(request, readLimit);
  if (ipLimit) return ipLimit;
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session?.user) return fail(m['video.error.sign_in'](), 401);
  const userLimit = enforceMinIntervalRateLimit(request, {
    ...readLimit,
    extraKey: session.user.id,
  });
  if (userLimit) return userLimit;
  if (id) {
    if (!z.uuid().safeParse(id).success)
      return fail(m['video.error.missing'](), 404);
    const job = await readVideoJob(session.user.id, id);
    return job
      ? respData(job, { headers: noStore })
      : fail(m['video.error.missing'](), 404);
  }

  const page = Math.min(
    1000,
    Math.max(1, Number.parseInt(query.get('page') ?? '1', 10) || 1)
  );
  const jobs = await listVideoJobs(session.user.id, page);
  const balance = await getBalance(session.user.id);
  return respData({ jobs, balance }, { headers: noStore });
}

export const Route = createFileRoute('/api/videos')({
  server: { handlers: { GET, POST } },
});
