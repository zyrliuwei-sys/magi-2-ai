import { useEffect, useId, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Aperture,
  ArrowUpRight,
  AudioLines,
  Clapperboard,
  Download,
  Film,
  ImagePlus,
  LoaderCircle,
  Play,
  Type,
  Upload,
  VolumeX,
  X,
} from 'lucide-react';

import { useSession } from '@/core/auth/client';
import { Link, usePathname, useRouter } from '@/core/i18n/navigation';
import {
  magiPrompts,
  magiStudioClips,
  perfumeStill,
  type MagiPromptId,
} from '@/config/magi-content';
import {
  DEFAULT_VIDEO_RESOLUTION,
  VIDEO_DURATIONS,
  VIDEO_IMAGE_LIMIT,
  VIDEO_IMAGE_TYPES,
  VIDEO_PROMPT_LIMIT,
  VIDEO_RATIOS,
  VIDEO_RESOLUTIONS,
  videoCreditCost,
  videoIsActive,
  type VideoJob,
  type VideoMode,
  type VideoSettings,
} from '@/config/magi-video';
import { apiGet, apiGetBlob, apiPostForm } from '@/lib/api-client';
import { m } from '@/paraglide/messages.js';
import { usePublicConfig } from '@/hooks/use-public-config';
import { useVideoPurchase } from '@/hooks/use-video-purchase';
import { MagiVideoPreview } from '@/components/magi-video-preview';

import { MagiLink } from './magi-site';

const draftKey = 'magi-video-draft';
const creditNumber = new Intl.NumberFormat('en-US');
const defaultSettings: VideoSettings = {
  mode: 'text-to-video',
  duration: 5,
  ratio: '16:9',
  resolution: DEFAULT_VIDEO_RESOLUTION,
  audio: true,
};

export function VideoDownload({ url }: { url: string }) {
  const download = useMutation({
    mutationFn: async () => {
      const blob = await apiGetBlob(url);
      if (
        blob.type &&
        !blob.type.startsWith('video/') &&
        blob.type !== 'application/octet-stream'
      )
        throw new Error('Unexpected file type');
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = 'magi-2-video.mp4';
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(href), 5_000);
    },
  });
  return (
    <div className="magi-download">
      <button
        type="button"
        className="magi-button magi-button-outline"
        disabled={download.isPending}
        onClick={() => download.mutate()}
      >
        <Download size={16} />{' '}
        {download.isPending
          ? m['video.studio.downloading']()
          : m['video.studio.download']()}
      </button>
      <a
        href={url}
        target="_blank"
        rel="nofollow noopener"
        className="magi-text-link"
      >
        {m['video.studio.mp4']()} <ArrowUpRight size={14} />
      </a>
      {download.isError && (
        <p role="status" className="magi-note">
          {m['video.studio.download_failed']()}
        </p>
      )}
    </div>
  );
}

export function MagiStudio({
  preview,
  initialMode,
  promptId,
  taskId,
  restore,
}: {
  preview: keyof typeof magiStudioClips;
  initialMode: VideoMode;
  promptId?: MagiPromptId;
  taskId?: string;
  restore?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, isPending: sessionPending } = useSession();
  const purchase = useVideoPurchase(session?.user?.id);
  const purchaseRequired = purchase.data?.canGenerate === false;
  const { data: publicConfig } = usePublicConfig();
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState({
    ...defaultSettings,
    mode: initialMode,
  });
  const generationOffline =
    (settings.mode === 'image-to-video'
      ? publicConfig?.video_image_generation_enabled
      : publicConfig?.video_generation_enabled) === 'false';
  const [prompt, setPrompt] = useState(() =>
    promptId ? m[`video.prompt.${promptId}.text`]() : ''
  );
  const [image, setImage] = useState<File>();
  const [needsStartingImage, setNeedsStartingImage] = useState(false);
  const [imageUrl, setImageUrl] = useState<string>();
  const [error, setError] = useState('');
  const [recentJob, setRecentJob] = useState<VideoJob>();
  const [referenceIndex, setReferenceIndex] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const promptInput = useRef<HTMLTextAreaElement>(null);
  const requestId = useRef<string | undefined>(undefined);
  const restoredJobId = useRef<string | undefined>(undefined);
  const inputId = useId();
  const jobId = recentJob?.id ?? taskId;

  useEffect(() => {
    if (!restore) return;
    try {
      const raw = window.sessionStorage.getItem(draftKey);
      if (!raw) return;
      window.sessionStorage.removeItem(draftKey);
      const draft = JSON.parse(raw) as {
        prompt: string;
        settings: VideoSettings;
        hadStartingImage?: boolean;
      };
      setPrompt(draft.prompt);
      setSettings({ ...defaultSettings, ...draft.settings });
      setNeedsStartingImage(draft.hadStartingImage === true);
    } catch {
      // Old or cleared drafts can be ignored.
    }
  }, [restore]);

  useEffect(() => {
    if (!image) {
      setImageUrl(undefined);
      return;
    }
    const url = URL.createObjectURL(image);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  const jobQuery = useQuery({
    queryKey: ['video-job', jobId, session?.user?.id],
    queryFn: () => apiGet<VideoJob>(`/api/videos?task=${jobId}`),
    enabled: !!jobId && !!session?.user,
    initialData: recentJob,
    staleTime: 2_000,
    refetchInterval: (query) =>
      query.state.data && videoIsActive(query.state.data) ? 5_000 : false,
    retry: 1,
    retryDelay: 2_000,
  });
  const job = jobQuery.data ?? recentJob;
  const working = !!job && videoIsActive(job);
  const references = magiStudioClips[preview];
  const reference = references[referenceIndex % references.length];
  const advanceReference =
    references.length > 1
      ? () => setReferenceIndex((i) => (i + 1) % references.length)
      : undefined;
  const inputImage = settings.mode === 'image-to-video' ? imageUrl : undefined;
  const showModelPreview = preview === 'home' && !job?.url && !inputImage;

  useEffect(() => {
    const saved = jobQuery.data;
    if (
      !taskId ||
      recentJob ||
      saved?.id !== taskId ||
      restoredJobId.current === taskId
    )
      return;
    restoredJobId.current = taskId;
    setPrompt(saved.prompt);
    setSettings({
      ...saved.settings,
      ratio:
        saved.settings.ratio === 'adaptive'
          ? defaultSettings.ratio
          : saved.settings.ratio,
    });
    setNeedsStartingImage(saved.settings.mode === 'image-to-video');
    requestId.current = undefined;
  }, [taskId, recentJob, jobQuery.data]);

  const sample = useMutation({
    mutationFn: () => apiGetBlob(perfumeStill),
    onSuccess: (blob) => {
      setImage(new File([blob], 'amber-perfume.jpg', { type: 'image/jpeg' }));
      setNeedsStartingImage(false);
      changeSettings({ mode: 'image-to-video' });
      setPrompt(m['video.prompt.orbit.text']());
    },
    onError: () => setError(m['video.error.image']()),
  });
  const generate = useMutation({
    mutationFn: (data: FormData) => apiPostForm<VideoJob>('/api/videos', data),
    onSuccess: (result) => {
      requestId.current = undefined;
      setRecentJob(result);
      queryClient.setQueryData(
        ['video-job', result.id, session?.user?.id],
        result
      );
      const search = new URLSearchParams({ task: result.id });
      if (promptId) search.set('prompt', promptId);
      router.replace(`${pathname}?${search}#studio`);
      void queryClient.invalidateQueries({ queryKey: ['video-history'] });
      void queryClient.invalidateQueries({ queryKey: ['credits'] });
    },
    onError: (err) => setError(err.message),
  });

  function changeSettings(next: Partial<VideoSettings>) {
    setSettings((previous) => ({ ...previous, ...next }));
    requestId.current = undefined;
    setError('');
  }

  function chooseImage(file: File | undefined) {
    if (!file) return;
    if (
      !VIDEO_IMAGE_TYPES.includes(file.type) ||
      file.size > VIDEO_IMAGE_LIMIT
    ) {
      setError(m['video.error.image']());
      return;
    }
    setImage(file);
    setNeedsStartingImage(false);
    changeSettings({ mode: 'image-to-video' });
  }

  function usePrompt() {
    const id = settings.mode === 'image-to-video' ? 'orbit' : 'coffee';
    setPrompt(m[`video.prompt.${id}.text`]());
    requestId.current = undefined;
    setError('');
    promptInput.current?.focus();
  }

  function saveDraft() {
    try {
      window.sessionStorage.setItem(
        draftKey,
        JSON.stringify({
          prompt,
          settings,
          hadStartingImage: settings.mode === 'image-to-video' && !!image,
        })
      );
    } catch {
      // Navigation still works if browser storage is unavailable.
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (generate.isPending || working) return;
    setError('');
    if (generationOffline) {
      setError(
        settings.mode === 'image-to-video'
          ? m['video.error.image_offline']()
          : m['video.error.offline']()
      );
      return;
    }
    if (!session?.user) {
      saveDraft();
      router.push(
        `/sign-in?callbackUrl=${encodeURIComponent(`${pathname}?restore=true#studio`)}`
      );
      return;
    }
    if (purchaseRequired) {
      saveDraft();
      router.push('/pricing');
      return;
    }
    if (!prompt.trim()) {
      setError(m['video.error.invalid']());
      promptInput.current?.focus();
      return;
    }
    if (settings.mode === 'image-to-video' && !image) {
      setError(m['video.error.image']());
      return;
    }
    requestId.current ??= crypto.randomUUID();
    const data = new FormData();
    data.set(
      'input',
      JSON.stringify({ id: requestId.current, prompt, ...settings })
    );
    if (settings.mode === 'image-to-video' && image) data.set('image', image);
    generate.mutate(data);
  }

  return (
    <section
      id="studio"
      className="magi-workbench"
      aria-label={m['video.studio.title']()}
    >
      <form className="magi-controls" onSubmit={submit}>
        <div className="magi-panel-heading">
          <span className="magi-panel-icon">
            <Clapperboard size={17} />
          </span>
          <h2>{m['video.studio.title']()}</h2>
        </div>
        <div className="magi-modes" aria-label={m['video.studio.title']()}>
          <button
            type="button"
            aria-pressed={settings.mode === 'text-to-video'}
            onClick={() => changeSettings({ mode: 'text-to-video' })}
          >
            <Type size={17} /> {m['video.studio.text']()}
          </button>
          <button
            type="button"
            aria-pressed={settings.mode === 'image-to-video'}
            onClick={() => changeSettings({ mode: 'image-to-video' })}
          >
            <ImagePlus size={17} /> {m['video.studio.image']()}
          </button>
        </div>
        {settings.mode === 'image-to-video' && (
          <div
            className="magi-upload"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              chooseImage(event.dataTransfer.files[0]);
            }}
          >
            <input
              type="file"
              accept={VIDEO_IMAGE_TYPES.join(',')}
              ref={fileInput}
              hidden
              onChange={(event) => {
                chooseImage(event.target.files?.[0]);
                event.currentTarget.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="magi-upload-choice"
            >
              {imageUrl ? <img src={imageUrl} alt="" /> : <Upload size={17} />}
              <span>
                <strong>{image?.name || m['video.studio.upload']()}</strong>
                <small>{m['video.studio.upload_hint']()}</small>
              </span>
            </button>
            {image && (
              <button
                type="button"
                className="magi-icon-button"
                aria-label={m['video.studio.remove']()}
                onClick={() => {
                  setImage(undefined);
                  requestId.current = undefined;
                }}
              >
                <X size={16} />
              </button>
            )}
          </div>
        )}
        <div className="magi-prompt-label">
          <label htmlFor={inputId}>{m['video.studio.prompt']()}</label>
          <button className="magi-text-link" type="button" onClick={usePrompt}>
            {m['video.studio.sample_prompt']()}
          </button>
        </div>
        <div className="magi-prompt-box">
          <textarea
            ref={promptInput}
            id={inputId}
            placeholder={m['video.studio.placeholder']()}
            value={prompt}
            maxLength={VIDEO_PROMPT_LIMIT}
            onChange={(event) => {
              setPrompt(event.target.value);
              requestId.current = undefined;
              setError('');
            }}
          />
          <span className="magi-count">
            {prompt.length}/{VIDEO_PROMPT_LIMIT}
          </span>
        </div>
        <div className="magi-settings">
          <label>
            {m['video.studio.duration']()}
            <select
              value={settings.duration}
              onChange={(event) =>
                changeSettings({
                  duration: Number(
                    event.target.value
                  ) as VideoSettings['duration'],
                })
              }
            >
              {VIDEO_DURATIONS.map((n) => (
                <option key={n} value={n}>
                  {m['video.studio.seconds']({ count: n })}
                </option>
              ))}
            </select>
          </label>
          <label>
            {m['video.studio.resolution']()}
            <select
              value={settings.resolution}
              onChange={(event) =>
                changeSettings({
                  resolution: event.target.value as VideoSettings['resolution'],
                })
              }
            >
              {VIDEO_RESOLUTIONS.map((resolution) => (
                <option key={resolution}>{resolution}</option>
              ))}
            </select>
          </label>
          <label>
            {m['video.studio.ratio']()}
            <select
              value={
                settings.mode === 'image-to-video' ? 'adaptive' : settings.ratio
              }
              disabled={settings.mode === 'image-to-video'}
              onChange={(event) =>
                changeSettings({
                  ratio: event.target.value as VideoSettings['ratio'],
                })
              }
            >
              {settings.mode === 'image-to-video' ? (
                <option value="adaptive">{m['video.studio.adaptive']()}</option>
              ) : (
                VIDEO_RATIOS.map((ratio) => (
                  <option key={ratio}>{ratio}</option>
                ))
              )}
            </select>
          </label>
          <div>
            <span id={`${inputId}-sound`}>{m['video.studio.sound']()}</span>
            <button
              type="button"
              className="magi-audio-toggle"
              aria-labelledby={`${inputId}-sound`}
              role="switch"
              aria-checked={settings.audio}
              onClick={() => changeSettings({ audio: !settings.audio })}
            >
              {settings.audio ? (
                <AudioLines size={16} />
              ) : (
                <VolumeX size={16} />
              )}{' '}
              {settings.audio
                ? m['video.studio.on']()
                : m['video.studio.off']()}
            </button>
          </div>
        </div>
        <button
          type="submit"
          className="magi-button magi-button-primary magi-generate"
          disabled={
            generate.isPending ||
            working ||
            sessionPending ||
            generationOffline ||
            (!!session?.user && purchase.isPending)
          }
        >
          {generate.isPending || working ? (
            <LoaderCircle size={18} className="magi-spin" />
          ) : (
            <Play size={17} fill="currentColor" />
          )}
          {generate.isPending
            ? m['video.studio.submitting']()
            : working
              ? m['video.history.status.processing']()
              : !sessionPending && !session?.user && !generationOffline
                ? m['video.studio.sign_in_to_generate']()
                : purchaseRequired
                  ? m['video.studio.buy_to_generate']()
                  : job?.status === 'success'
                    ? m['video.studio.again']()
                    : m['video.studio.generate']()}
          {!working && !generate.isPending && !purchaseRequired && (
            <span>
              {m['video.studio.credit']({
                count: creditNumber.format(
                  videoCreditCost(settings.duration, settings.resolution)
                ),
              })}
            </span>
          )}
        </button>
        {error && (
          <p className="magi-error" role="alert">
            {error}{' '}
            {(error === m['video.error.credits']() ||
              error === m['video.error.purchase_required']()) && (
              <Link href="/pricing" onClick={saveDraft}>
                {m['video.nav.pricing']()}
              </Link>
            )}
          </p>
        )}
        {!generationOffline &&
          !working &&
          !error &&
          (!session?.user || purchaseRequired) && (
            <p className="magi-note">{m['video.studio.payment_required']()}</p>
          )}
        {generationOffline && !error && (
          <p className="magi-note" role="status">
            {settings.mode === 'image-to-video'
              ? m['video.error.image_offline']()
              : m['video.studio.offline']()}
          </p>
        )}
        {!generationOffline &&
          !error &&
          settings.mode === 'image-to-video' &&
          (!session?.user && image ? (
            <p className="magi-note">
              {m['video.studio.image_before_sign_in']()}
            </p>
          ) : needsStartingImage && !image ? (
            <p className="magi-note" role="status">
              {m['video.studio.image_after_sign_in']()}
            </p>
          ) : null)}
      </form>
      <div className="magi-preview">
        <div className="magi-preview-top">
          <div className="magi-panel-heading">
            <Film size={19} />
            <h2>
              {showModelPreview
                ? m['video.studio.model_preview']()
                : m['video.studio.preview']()}
            </h2>
          </div>
          <span className="magi-format">
            {job?.settings.resolution ?? settings.resolution} <span>/</span>{' '}
            {job?.settings.ratio === 'adaptive' ||
            (!job && settings.mode === 'image-to-video')
              ? m['video.studio.adaptive']()
              : (job?.settings.ratio ?? settings.ratio)}
          </span>
        </div>
        {showModelPreview && (
          <div className="magi-preview-context">
            <p>{m['video.studio.model_preview_description']()}</p>
            <MagiLink href="/magi-2-preview">
              {m['video.nav.model_preview']()}
            </MagiLink>
          </div>
        )}
        <div
          className="magi-viewer"
          data-composition={!job?.url && !inputImage ? true : undefined}
        >
          {job?.url && job.status === 'success' ? (
            <video
              src={job.url}
              controls
              playsInline
              preload="metadata"
              aria-label={m['video.studio.output']()}
            />
          ) : inputImage ? (
            <img
              src={inputImage}
              alt={m['video.studio.ready_image']()}
              width={1440}
              height={810}
            />
          ) : (
            <MagiVideoPreview
              src={reference.video}
              poster={reference.poster}
              label={m[`video.studio.reference.${reference.label}`]()}
              paused={working || generate.isPending}
              onEnded={advanceReference}
              onError={
                reference.video.startsWith('https://')
                  ? advanceReference
                  : undefined
              }
            />
          )}
          {(working || generate.isPending) && (
            <div className="magi-rendering" role="status">
              <LoaderCircle size={27} className="magi-spin" />
              <p>{m['video.studio.working']()}</p>
            </div>
          )}
        </div>
        <div className="magi-preview-bottom">
          {job?.url && job.status === 'success' ? (
            <VideoDownload url={job.url} />
          ) : (
            <>
              <span>
                <Aperture size={15} />{' '}
                {inputImage ? (
                  m['video.studio.ready_image']()
                ) : (
                  <a className="magi-text-link" href="#magi-sources">
                    {reference.publisher === 'sand'
                      ? m['video.gallery.official']()
                      : reference.publisher === 'higgsfield'
                        ? m['video.gallery.higgsfield.source']()
                        : m['video.media.pexels']()}
                  </a>
                )}
              </span>
              <button
                type="button"
                className="magi-text-link"
                disabled={sample.isPending}
                onClick={() => sample.mutate()}
              >
                {m['video.studio.sample_image']()} <ArrowUpRight size={14} />
              </button>
            </>
          )}
        </div>
        {job?.status === 'failed' && (
          <p className="magi-error" role="status">
            {m['video.studio.failed']()}
          </p>
        )}
        {job?.status === 'canceled' && (
          <p className="magi-note" role="status">
            {m['video.studio.canceled']()}
          </p>
        )}
        {taskId && jobQuery.isError && !job && (
          <p className="magi-error" role="status">
            {jobQuery.error.message}
          </p>
        )}
      </div>
    </section>
  );
}

export function parseStudioSearch(search: Record<string, unknown>): {
  prompt?: MagiPromptId;
  task?: string;
  restore?: boolean;
} {
  return {
    prompt: magiPrompts.find(({ id }) => id === search.prompt)?.id,
    task:
      typeof search.task === 'string' && /^[0-9a-f-]{36}$/i.test(search.task)
        ? search.task
        : undefined,
    restore:
      search.restore === true || search.restore === '1' ? true : undefined,
  };
}
