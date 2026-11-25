import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createFileRoute } from '@tanstack/react-router';
import { MultipartTooLargeError, readMultipartForm } from '@/server/multipart';

import { getAuth } from '@/core/auth';
import { envConfigs } from '@/config';
import { getStorage } from '@/modules/storage/service';
import { enforceMinIntervalRateLimit } from '@/lib/rate-limit';
import { respData, respErr } from '@/lib/resp';

// Raster formats only. SVG can carry script and would run on whatever origin
// serves it, so it is not accepted from users.
const extFromMime = (mimeType: string) => {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/avif': 'avif',
    'image/heic': 'heic',
    'image/heif': 'heif',
  };
  return Object.hasOwn(map, mimeType) ? map[mimeType] : '';
};

// Cap for the no-storage local-disk fallback (dev). Configurable via INLINE_IMAGE_MAX_KB.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
// Per request: bounds memory (formData() buffers the whole body) and storage use.
const MAX_FILES_PER_REQUEST = 10;
const MAX_REQUEST_BYTES = 20 * 1024 * 1024;

const INLINE_MAX_BYTES =
  (Number(envConfigs.inline_image_max_kb) || 10240) * 1024;

async function POST({ request }: { request: Request }) {
  const limited = enforceMinIntervalRateLimit(request, {
    intervalMs: 1000,
    keyPrefix: 'upload-image',
  });
  if (limited) return limited;

  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) return respErr('Unauthorized');

    // Per account too: one user can't sidestep the IP bucket by switching networks.
    const userLimited = enforceMinIntervalRateLimit(request, {
      intervalMs: 1000,
      keyPrefix: 'upload-image',
      extraKey: session.user.id,
    });
    if (userLimited) return userLimited;

    let formData: FormData;
    try {
      formData = await readMultipartForm(
        request,
        MAX_REQUEST_BYTES + 64 * 1024
      );
    } catch (error) {
      return error instanceof MultipartTooLargeError
        ? respErr('Upload is larger than 20MB in total', { status: 413 })
        : respErr('Invalid image upload', { status: 400 });
    }
    const files = formData.getAll('files');
    if (
      !files.length ||
      !files.every((file): file is File => file instanceof File)
    )
      return respErr('No files provided');
    if (files.length > MAX_FILES_PER_REQUEST) {
      return respErr(`At most ${MAX_FILES_PER_REQUEST} files per upload`);
    }
    if (files.reduce((sum, f) => sum + f.size, 0) > MAX_REQUEST_BYTES) {
      return respErr('Upload is larger than 20MB in total');
    }
    for (const file of files) {
      if (!extFromMime(file.type))
        return respErr(`File ${file.name} is not a supported image type`);
      if (file.size > MAX_UPLOAD_BYTES)
        return respErr(`File ${file.name} is larger than 10MB`);
    }

    const storage = await getStorage();
    const uploadResults: Array<{
      url: string;
      key: string;
      filename: string;
      deduped: boolean;
    }> = [];

    for (const file of files) {
      // The extension (and so how the file is served) comes only from this
      // allow-list — never from the client-supplied file name.
      const ext = extFromMime(file.type);
      const arrayBuffer = await file.arrayBuffer();
      const body = new Uint8Array(arrayBuffer);

      const digest = Array.from(
        new Uint8Array(await crypto.subtle.digest('SHA-256', arrayBuffer)),
        (byte) => byte.toString(16).padStart(2, '0')
      ).join('');
      // R2Provider prepends its own uploadPath (default `uploads`), so the object
      // key is the bare filename. The local fallback uses `public/uploads/<file>`.
      const objectKey = `${digest}.${ext}`;

      // No storage configured → persist to public/uploads and return a short
      // local URL. Avoids inlining a giant base64 data URL into DB columns (some
      // are varchar(255)). Configure R2 (admin → Storage) for production.
      if (!storage) {
        // Cloudflare Workers have no writable filesystem — fail clearly
        // instead of with an opaque fs error.
        if ((globalThis as any).__CF_ENV__) {
          return respErr(
            'Storage is not configured. Set up R2 in Admin → Settings → Storage.'
          );
        }
        if (body.length > INLINE_MAX_BYTES) {
          const limitKb = Math.round(INLINE_MAX_BYTES / 1024);
          return respErr(
            `Image too large (${(body.length / 1024).toFixed(0)}KB > ${limitKb}KB). Configure storage or use a smaller image.`
          );
        }
        const dir = path.join(process.cwd(), 'public', 'uploads');
        await mkdir(dir, { recursive: true });
        await writeFile(path.join(dir, objectKey), body);
        uploadResults.push({
          url: `/uploads/${objectKey}`,
          key: `uploads/${objectKey}`,
          filename: file.name,
          deduped: false,
        });
        continue;
      }

      const exists = await storage.exists({ key: objectKey });
      if (exists) {
        const publicUrl = storage.getPublicUrl({ key: objectKey });
        if (publicUrl) {
          uploadResults.push({
            url: publicUrl,
            key: objectKey,
            filename: file.name,
            deduped: true,
          });
          continue;
        }
      }

      const result = await storage.uploadFile({
        body,
        key: objectKey,
        contentType: file.type,
        disposition: 'inline',
      });

      if (!result.success || !result.url) {
        return respErr('Upload failed');
      }

      uploadResults.push({
        url: result.url,
        key: result.key || objectKey,
        filename: file.name,
        deduped: false,
      });
    }

    return respData({
      urls: uploadResults.map((r) => r.url),
      results: uploadResults,
    });
  } catch (error) {
    console.error(
      'upload image failed:',
      error instanceof Error ? error.name : 'Unknown error'
    );
    return respErr('Upload failed');
  }
}

export const Route = createFileRoute('/api/storage/upload-image')({
  server: {
    handlers: { POST },
  },
});
