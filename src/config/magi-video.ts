export const MAGI_VIDEO_DURATION = 10;
export const MAGI_VIDEO_CREDITS = 3_000;
export const MAGI_VIDEO_RESOLUTION = '1080p';
export const MAGI_VIDEO_MAX_SEED = 2_147_483_647;
export const VIDEO_RATIOS = [
  '16:9',
  '9:16',
  '21:9',
  '4:3',
  '3:4',
  '1:1',
] as const;
export const VIDEO_MODES = ['text-to-video', 'image-to-video'] as const;
export const VIDEO_RESOLUTIONS = ['480p', '720p', '1080p'] as const;
export const VIDEO_PROMPT_LIMIT = 15_000;
export const VIDEO_IMAGE_LIMIT = 10 * 1024 * 1024;
export const VIDEO_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const VIDEO_JOB_PROVIDER = 'seeapi';
export const LEGACY_VIDEO_JOB_PROVIDER = 'higgsfield';
export const VIDEO_MODEL = 'magi-2';
export const LEGACY_SEEAPI_VIDEO_MODEL = 'seedance-2-5';

export type VideoMode = (typeof VIDEO_MODES)[number];
export type VideoRatio = (typeof VIDEO_RATIOS)[number];
export type VideoResolution = (typeof VIDEO_RESOLUTIONS)[number];
export type SeeApiVideoModel =
  typeof VIDEO_MODEL | typeof LEGACY_SEEAPI_VIDEO_MODEL;

export type VideoSettings = {
  mode: VideoMode;
  duration: number;
  ratio: VideoRatio;
  resolution: VideoResolution;
  audio: boolean;
  seed?: number;
};

export type VideoJob = {
  id: string;
  prompt: string;
  settings: Omit<VideoSettings, 'ratio'> & { ratio: VideoRatio | 'adaptive' };
  status: 'pending' | 'processing' | 'success' | 'failed' | 'canceled';
  cost: number;
  createdAt: string;
  url?: string;
};

export function videoIsActive(job: VideoJob) {
  return job.status === 'pending' || job.status === 'processing';
}
