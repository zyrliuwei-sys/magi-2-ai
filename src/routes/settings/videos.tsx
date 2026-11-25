import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createFileRoute, Link as RouterLink } from '@tanstack/react-router';
import { ArrowUpRight, Film } from 'lucide-react';

import { useSession } from '@/core/auth/client';
import { Link } from '@/core/i18n/navigation';
import { videoIsActive, type VideoJob } from '@/config/magi-video';
import { apiGet } from '@/lib/api-client';
import { m } from '@/paraglide/messages.js';
import { VideoDownload } from '@/blocks/magi-studio';

const creditNumber = new Intl.NumberFormat('en-US');

export const Route = createFileRoute('/settings/videos')({
  component: VideosPage,
});

function VideosPage() {
  const [page, setPage] = useState(1);
  const { data: session } = useSession();
  const query = useQuery({
    queryKey: ['video-history', session?.user?.id, page],
    queryFn: () =>
      apiGet<{ jobs: VideoJob[]; balance: number }>(`/api/videos?page=${page}`),
    enabled: !!session?.user,
    placeholderData: keepPreviousData,
    refetchInterval: ({ state }) =>
      state.data?.jobs.some(videoIsActive) ? 8_000 : false,
  });
  const jobs = query.data?.jobs ?? [];
  return (
    <section className="magi-history">
      <div className="magi-section-heading">
        <div>
          <h1>{m['video.history.title']()}</h1>
          <p>{m['video.history.description']()}</p>
        </div>
        <Link href="/" className="magi-button magi-button-primary">
          {m['video.nav.start']()} <ArrowUpRight size={15} />
        </Link>
      </div>
      {query.data && (
        <p className="magi-note">
          {m['video.studio.balance']({
            count: creditNumber.format(query.data.balance),
          })}
        </p>
      )}
      {(query.isPending || query.isError || !jobs.length) && (
        <p role="status" className="magi-history-empty">
          <Film size={24} />{' '}
          {query.isPending
            ? m['video.history.loading']()
            : query.isError
              ? m['video.history.error']()
              : m['video.history.empty']()}
        </p>
      )}
      <div className="magi-history-grid">
        {jobs.map((job) => (
          <article className="magi-clip" key={job.id}>
            {job.url && (
              <video
                src={job.url}
                controls
                playsInline
                preload="none"
                aria-label={m['video.studio.output']()}
              />
            )}
            <div className="magi-history-card">
              <div className="magi-clip-text">
                <strong>{m[`video.history.status.${job.status}`]()}</strong>
                <time dateTime={job.createdAt}>
                  {new Date(job.createdAt).toLocaleDateString('en-US')}
                </time>
              </div>
              <p>{job.prompt}</p>
              <p className="magi-note">
                {m['video.studio.seconds']({ count: job.settings.duration })} /{' '}
                {job.settings.resolution} /{' '}
                {job.settings.ratio === 'adaptive'
                  ? m['video.studio.adaptive']()
                  : job.settings.ratio}{' '}
                /{' '}
                {m['video.studio.credit']({
                  count: creditNumber.format(job.cost),
                })}
              </p>
              <div className="magi-inline-links">
                {job.url && <VideoDownload url={job.url} />}
                <RouterLink
                  to={
                    job.settings.mode === 'image-to-video'
                      ? '/image-to-video'
                      : '/text-to-video'
                  }
                  search={{ task: job.id }}
                  hash="studio"
                  className="magi-text-link"
                >
                  {m['video.history.open']()} <ArrowUpRight size={14} />
                </RouterLink>
              </div>
            </div>
          </article>
        ))}
      </div>
      {(page > 1 || jobs.length === 12) && (
        <div className="magi-inline-links magi-pagination">
          <button
            type="button"
            className="magi-button magi-button-outline"
            disabled={page <= 1 || query.isFetching}
            onClick={() => setPage(page - 1)}
          >
            {m['video.history.previous']()}
          </button>
          <button
            type="button"
            className="magi-button magi-button-outline"
            disabled={jobs.length < 12 || query.isFetching}
            onClick={() => setPage(page + 1)}
          >
            {m['video.history.next']()}
          </button>
        </div>
      )}
    </section>
  );
}
