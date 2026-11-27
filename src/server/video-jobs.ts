import { z } from 'zod';

import { getHiggsfieldVideo } from '@/core/ai/higgsfield';
import {
  createSeeApiVideoClient,
  SeeApiVideoError,
} from '@/core/ai/seeapi-video';
import { envConfigs } from '@/config';
import {
  LEGACY_VIDEO_JOB_PROVIDER,
  VIDEO_DURATIONS,
  VIDEO_IMAGE_LIMIT,
  VIDEO_IMAGE_TYPES,
  VIDEO_JOB_PROVIDER,
  VIDEO_MODEL,
  VIDEO_MODES,
  VIDEO_PROMPT_LIMIT,
  VIDEO_RATIOS,
  VIDEO_RESOLUTIONS,
  videoCreditCost,
  type VideoJob,
  type VideoSettings,
} from '@/config/magi-video';
import {
  AITaskStatus,
  claimTaskSubmission,
  createTask,
  findTask,
  getTasks,
  updateTask,
} from '@/modules/ai-tasks/service';
import { getAllConfigs, type ConfigMap } from '@/modules/config/service';
import { getBalance } from '@/modules/credits/service';
import { getVideoPurchaseStatus } from '@/modules/payment/service';
import { getStorage } from '@/modules/storage/service';

export const videoRequestSchema = z.object({
  id: z.uuid(),
  prompt: z.string().trim().min(1).max(VIDEO_PROMPT_LIMIT),
  mode: z.enum(VIDEO_MODES),
  duration: z.literal(VIDEO_DURATIONS),
  ratio: z.enum(VIDEO_RATIOS),
  resolution: z.enum(VIDEO_RESOLUTIONS),
  audio: z.boolean(),
});

const settingsSchema = videoRequestSchema.omit({ id: true, prompt: true });
const httpsUrl = z.url({ protocol: /^https$/ });
const storedSettings = settingsSchema.extend({
  resolution: settingsSchema.shape.resolution.default('1080p'),
  firstFrame: httpsUrl.optional(),
});
const outputSchema = z.object({ url: httpsUrl });
const submissionRetryMs = 30_000;
const orphanedSubmitMs = 10 * 60_000;
const videoProviders = [VIDEO_JOB_PROVIDER, LEGACY_VIDEO_JOB_PROVIDER];
type VideoTask = NonNullable<Awaited<ReturnType<typeof findTask>>>;
type SeeApiClient = NonNullable<ReturnType<typeof createSeeApiVideoClient>>;
type SeeApiGeneration = Awaited<ReturnType<SeeApiClient['get']>>;

export function videoAvailability(configs: ConfigMap) {
  const text = !!createSeeApiVideoClient(configs);
  const image =
    text &&
    !!(
      configs.r2_access_key &&
      configs.r2_secret_key &&
      configs.r2_bucket_name &&
      httpsUrl.safeParse(configs.r2_domain).success
    );
  return { text, image };
}

export class VideoUnavailableError extends Error {
  constructor(readonly mode: VideoSettings['mode']) {
    super('Video generation is unavailable');
  }
}

export class VideoPurchaseRequiredError extends Error {}

function ownsTask(
  task: VideoTask | undefined,
  userId: string
): task is VideoTask {
  return (
    !!task &&
    task.userId === userId &&
    videoProviders.some((provider) => provider === task.provider) &&
    (task.provider !== VIDEO_JOB_PROVIDER || task.model === VIDEO_MODEL) &&
    task.mediaType === 'video' &&
    !task.deletedAt
  );
}

function readJson(value: string | null): unknown {
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function toVideoJob(task: VideoTask): VideoJob {
  const parsed = storedSettings.safeParse(readJson(task.options));
  const { mode, duration, ratio, resolution, audio } = parsed.success
    ? parsed.data
    : ({
        mode: 'text-to-video',
        duration: 5,
        ratio: '16:9',
        resolution: '1080p',
        audio: true,
      } satisfies VideoSettings);
  const output = outputSchema.safeParse(readJson(task.taskResult));
  return {
    id: task.id,
    prompt: task.prompt,
    settings: {
      mode,
      duration,
      resolution,
      audio,
      ratio:
        mode === 'image-to-video' && task.provider === VIDEO_JOB_PROVIDER
          ? 'adaptive'
          : ratio,
    },
    status: task.status as VideoJob['status'],
    cost: task.costCredits,
    createdAt: task.createdAt.toISOString(),
    url: output.success ? output.data.url : undefined,
  };
}

export async function validateReference(value: FormDataEntryValue | null) {
  if (
    !(value instanceof File) ||
    !VIDEO_IMAGE_TYPES.includes(value.type) ||
    value.size > VIDEO_IMAGE_LIMIT
  )
    return;
  const bytes = new Uint8Array(await value.slice(0, 12).arrayBuffer());
  const jpeg =
    value.type === 'image/jpeg' &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255;
  const png =
    value.type === 'image/png' &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => byte === bytes[i]);
  const webp =
    value.type === 'image/webp' &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  if (jpeg || png || webp) return value;
}

export async function startVideoJob(
  userId: string,
  input: z.infer<typeof videoRequestSchema>,
  image?: File
) {
  const { id, prompt, ...settings } = input;
  const found = await findTask(id);
  if (found) return ownsTask(found, userId) ? toVideoJob(found) : undefined;

  if (!(await getVideoPurchaseStatus(userId)).canGenerate)
    throw new VideoPurchaseRequiredError();

  const configs = await getAllConfigs();
  const client = createSeeApiVideoClient(configs);
  const isImage = settings.mode === 'image-to-video';
  if (!client) throw new VideoUnavailableError('text-to-video');
  if (isImage && (!image || !videoAvailability(configs).image))
    throw new VideoUnavailableError(settings.mode);

  const costCredits = videoCreditCost(settings.duration, settings.resolution);
  let firstFrame: string | undefined;
  if (isImage && image) {
    // Avoid storing uploads from accounts unable to pay. createTask checks again atomically.
    if ((await getBalance(userId)) < costCredits)
      throw new Error('Insufficient credits');
    const storage = await getStorage();
    const result = await storage?.uploadFile({
      key: `video-inputs/${crypto.randomUUID()}.${image.type.split('/')[1]}`,
      body: new Uint8Array(await image.arrayBuffer()),
      contentType: image.type,
      disposition: 'inline',
    });
    if (!result?.success || !httpsUrl.safeParse(result.url).success)
      throw new VideoUnavailableError(settings.mode);
    firstFrame = result.url;
  }

  let task: VideoTask;
  try {
    task = await createTask({
      id,
      userId,
      prompt,
      mediaType: 'video',
      provider: VIDEO_JOB_PROVIDER,
      model: VIDEO_MODEL,
      costCredits,
      options: { ...settings, firstFrame },
    });
  } catch (error) {
    // A concurrent retry can win the insert without charging a second time.
    const existing = await findTask(id);
    if (existing)
      return ownsTask(existing, userId) ? toVideoJob(existing) : undefined;
    throw error;
  }

  return toVideoJob(await submitTask(task, client));
}

async function submitTask(task: VideoTask, client: SeeApiClient) {
  const settings = storedSettings.safeParse(readJson(task.options));
  if (!settings.success) return await failUnsubmittedTask(task);

  let generation: SeeApiGeneration;
  try {
    generation = await client.submit(
      task.id,
      task.prompt,
      settings.data,
      settings.data.firstFrame
    );
  } catch (error) {
    if (error instanceof SeeApiVideoError && error.rejected)
      return await failUnsubmittedTask(task);
    // A lost response can still represent a paid upstream job. Reuse its key.
    return task;
  }

  const submitted = await updateTask({
    taskId: task.id,
    status: AITaskStatus.PROCESSING,
    providerTaskId: generation.id,
  });
  return settleSeeApiTask(submitted ?? task, generation);
}

async function failUnsubmittedTask(task: VideoTask) {
  return (
    (await updateTask({
      taskId: task.id,
      status: AITaskStatus.FAILED,
      onlyIfUnsubmitted: true,
    })) ?? task
  );
}

async function settleSeeApiTask(task: VideoTask, generation: SeeApiGeneration) {
  if (task.taskId !== generation.id) return task;
  if (generation.status === 'succeeded' && generation.url) {
    return (
      (await updateTask({
        taskId: task.id,
        status: AITaskStatus.SUCCESS,
        taskResult: { url: generation.url },
      })) ?? task
    );
  }
  if (
    ['failed', 'refunded', 'canceled', 'expired'].includes(generation.status)
  ) {
    const status =
      generation.status === 'canceled'
        ? AITaskStatus.CANCELED
        : AITaskStatus.FAILED;
    return (await updateTask({ taskId: task.id, status })) ?? task;
  }
  return task;
}

async function refreshTask(task: VideoTask, configs: ConfigMap) {
  if (
    task.status !== AITaskStatus.PENDING &&
    task.status !== AITaskStatus.PROCESSING
  )
    return task;
  if (task.provider === VIDEO_JOB_PROVIDER) {
    const client = createSeeApiVideoClient(configs);
    if (task.taskId) {
      if (!client) return task;
      const generation = await client.get(task.taskId).catch(() => undefined);
      return generation ? settleSeeApiTask(task, generation) : task;
    }
    const now = Date.now();
    const elapsed = now - task.createdAt.getTime();
    if (elapsed >= orphanedSubmitMs) return failUnsubmittedTask(task);
    if (
      client &&
      elapsed < orphanedSubmitMs - submissionRetryMs &&
      now - task.updatedAt.getTime() >= submissionRetryMs &&
      (await claimTaskSubmission(task.id, task.updatedAt))
    )
      return submitTask(task, client);
    return task;
  }

  if (!task.taskId)
    return Date.now() - task.updatedAt.getTime() >= 3 * 60_000
      ? failUnsubmittedTask(task)
      : task;
  if (!envConfigs.higgsfield_api_key.trim()) return task;

  const provider = await getHiggsfieldVideo(task.taskId).catch(() => null);
  if (!provider) return task;

  if (provider.status === 'completed' && provider.video) {
    return (
      (await updateTask({
        taskId: task.id,
        status: AITaskStatus.SUCCESS,
        taskResult: provider.video,
      })) ?? task
    );
  }
  if (['failed', 'nsfw', 'canceled'].includes(provider.status)) {
    const status =
      provider.status === 'canceled'
        ? AITaskStatus.CANCELED
        : AITaskStatus.FAILED;
    return (await updateTask({ taskId: task.id, status })) ?? task;
  }
  return task;
}

export async function readVideoJob(userId: string, id: string) {
  const task = await findTask(id);
  if (ownsTask(task, userId))
    return toVideoJob(await refreshTask(task, await getAllConfigs()));
}

export async function listVideoJobs(userId: string, page: number) {
  const tasks: VideoTask[] = await getTasks({
    userId,
    page,
    limit: 12,
    mediaType: 'video',
    provider: videoProviders,
  });
  const active = tasks
    .filter((task) => ['pending', 'processing'].includes(task.status))
    .slice(0, 4);
  const refreshed = new Map(
    active.length
      ? await getAllConfigs().then((configs) =>
          Promise.all(
            active.map(
              async (task) =>
                [task.id, await refreshTask(task, configs)] as const
            )
          )
        )
      : []
  );
  return tasks.map((task) => toVideoJob(refreshed.get(task.id) ?? task));
}
