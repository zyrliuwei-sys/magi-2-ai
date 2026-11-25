export const VIDEO_DURATIONS = [5, 10, 15] as const;
export const VIDEO_RATIOS = ['16:9', '9:16'] as const;
export const VIDEO_MODES = ['text-to-video', 'image-to-video'] as const;
export const VIDEO_RESOLUTIONS = ['480p', '720p', '1080p'] as const;
export const DEFAULT_VIDEO_RESOLUTION = '480p';
// SeeAPI's published Seedance 2.5 text and first-frame rates, multiplied by 10.
export const VIDEO_CREDITS_PER_SECOND = {
  '480p': 38 * 10,
  '720p': 85 * 10,
  '1080p': 211 * 10,
} as const;
export const VIDEO_PROMPT_LIMIT = 2000;
export const VIDEO_IMAGE_LIMIT = 10 * 1024 * 1024;
export const VIDEO_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const VIDEO_JOB_PROVIDER = 'seeapi';
export const LEGACY_VIDEO_JOB_PROVIDER = 'higgsfield';
export const VIDEO_MODEL = 'seedance-2-5';

export type VideoMode = (typeof VIDEO_MODES)[number];
export type VideoDuration = (typeof VIDEO_DURATIONS)[number];
export type VideoRatio = (typeof VIDEO_RATIOS)[number];
export type VideoResolution = (typeof VIDEO_RESOLUTIONS)[number];

export type VideoSettings = {
  mode: VideoMode;
  duration: VideoDuration;
  ratio: VideoRatio;
  resolution: VideoResolution;
  audio: boolean;
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

export function videoCreditCost(
  duration: VideoDuration,
  resolution: VideoResolution
) {
  return duration * VIDEO_CREDITS_PER_SECOND[resolution];
}

export function videoIsActive(job: VideoJob) {
  return job.status === 'pending' || job.status === 'processing';
}
