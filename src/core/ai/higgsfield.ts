import { z } from 'zod';

import { envConfigs } from '@/config';
import type { VideoSettings } from '@/config/magi-video';

const api = 'https://api.higgsfield.ai';
const secureUrl = z.url({ protocol: /^https$/ });
const providerId = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);

async function providerRequest(path: string, body?: object) {
  const response = await fetch(`${api}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Key ${envConfigs.higgsfield_api_key.trim()}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok)
    throw new Error(`Higgsfield responded with ${response.status}`);
  return response.json();
}

const uploadSchema = z.object({
  upload_url: secureUrl,
  public_url: secureUrl,
  upload_headers: z.record(z.string(), z.string()),
});

export async function uploadHiggsfieldImage(file: File) {
  const upload = uploadSchema.parse(
    await providerRequest('/files/generate-upload-url', {
      content_type: file.type,
    })
  );
  const response = await fetch(upload.upload_url, {
    method: 'PUT',
    headers: upload.upload_headers,
    body: file,
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok)
    throw new Error(`Reference upload returned ${response.status}`);
  return upload.public_url;
}

export async function submitHiggsfieldVideo(
  settings: VideoSettings,
  prompt: string,
  imageUrl?: string
) {
  const reply = await providerRequest(`/sand/magi-2/${settings.mode}`, {
    prompt,
    duration: settings.duration,
    resolution: '1080p',
    aspect_ratio: settings.ratio,
    generate_audio: settings.audio,
    ...(imageUrl ? { image_url: imageUrl } : {}),
  });
  return z.object({ request_id: providerId }).parse(reply).request_id;
}

const statusSchema = z.object({
  status: z.string(),
  video: z.object({ url: secureUrl }).nullish(),
});

export async function getHiggsfieldVideo(id: string) {
  return statusSchema.parse(
    await providerRequest(`/requests/${providerId.parse(id)}/status`)
  );
}
