import { z } from 'zod';

import { VIDEO_MODEL, type VideoSettings } from '@/config/magi-video';
import { normalizeSeeApiConfigs } from '@/config/seeapi';

const generationResponse = z.object({
  generation: z.object({
    id: z.string().min(1),
    status: z.enum([
      'processing',
      'succeeded',
      'failed',
      'canceled',
      'refunded',
      'expired',
    ]),
    result: z
      .object({
        assets: z
          .array(
            z.object({
              type: z.string().optional(),
              url: z.string().optional(),
            })
          )
          .optional(),
      })
      .nullable()
      .optional(),
  }),
});

const httpsUrl = z.url({ protocol: /^https$/ });

export class SeeApiVideoError extends Error {
  constructor(readonly status: number) {
    super(`SeeAPI generation request failed (HTTP ${status})`);
  }

  get rejected() {
    return [400, 401, 402, 403, 404, 413, 422].includes(this.status);
  }
}

export function createSeeApiVideoClient(configs: Record<string, string>) {
  let baseUrl: string;
  let key: string;
  try {
    const values = normalizeSeeApiConfigs({
      seeapi_base_url: configs.seeapi_base_url || '',
      seeapi_api_key: configs.seeapi_api_key || '',
    });
    baseUrl = values.seeapi_base_url;
    key = values.seeapi_api_key;
  } catch {
    return;
  }
  if (!key || key.startsWith('••••••••')) return;

  async function request(path: string, init?: RequestInit) {
    const headers = new Headers(init?.headers);
    headers.set('Accept', 'application/json');
    headers.set('Authorization', `Bearer ${key}`);
    const response = await fetch(`${baseUrl}/v1/generations${path}`, {
      ...init,
      headers,
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new SeeApiVideoError(response.status);
    }

    const { generation } = generationResponse.parse(await response.json());
    const asset = generation.result?.assets?.find(
      ({ type, url }) => type === 'video' && httpsUrl.safeParse(url).success
    );
    return { id: generation.id, status: generation.status, url: asset?.url };
  }

  return {
    submit(
      id: string,
      prompt: string,
      settings: VideoSettings,
      firstFrame?: string
    ) {
      return request('', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': id },
        body: JSON.stringify({
          model: VIDEO_MODEL,
          endpoint: settings.mode,
          provider: 'seeapi',
          input: {
            prompt,
            aspect_ratio:
              settings.mode === 'image-to-video' ? 'adaptive' : settings.ratio,
            duration_seconds: settings.duration,
            resolution: settings.resolution,
            generate_audio: settings.audio,
            first_frame_image: firstFrame,
            output_format: 'mp4',
            nsfw_checker: true,
          },
        }),
      });
    },
    get(id: string) {
      return request(`/${encodeURIComponent(id)}`);
    },
  };
}
