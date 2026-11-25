import { useRef, useState } from 'react';
import { ArrowUpRight, Play } from 'lucide-react';
import { flushSync } from 'react-dom';

import {
  higgsfieldMagiDocs,
  magiGuideClips,
  sandMagiAnnouncement,
} from '@/config/magi-content';
import { m } from '@/paraglide/messages.js';
import { MagiVideoPreview } from '@/components/magi-video-preview';

import { MagiLink } from './magi-site';

const chapters = [
  ['overview', sandMagiAnnouncement],
  ['text', '/text-to-video'],
  ['image', '/image-to-video'],
  ['audio', '/guide#sound'],
  ['format', '/pricing'],
  ['review', '/examples'],
] as const;

function ChapterVideo({ chapter }: { chapter: keyof typeof magiGuideClips }) {
  const clip = magiGuideClips[chapter];
  const poster = 'poster' in clip ? clip.poster : undefined;
  const title = m[`video.article.media.${chapter}.title`]();
  const [active, setActive] = useState(false);
  const [failed, setFailed] = useState(false);
  const player = useRef<HTMLVideoElement>(null);

  return (
    <figure className="magi-editorial-media">
      <div className="magi-editorial-player">
        {!active || failed ? (
          <button
            type="button"
            aria-label={m['video.article.media.play']({ title })}
            onClick={() => {
              flushSync(() => {
                setFailed(false);
                setActive(true);
              });
              player.current?.focus();
              void player.current?.play().catch(() => {
                // Native controls are available if the browser blocks playback.
              });
            }}
          >
            <MagiVideoPreview src={clip.url} poster={poster} paused={failed} />
            <span aria-hidden="true">
              <Play size={21} fill="currentColor" />
            </span>
          </button>
        ) : (
          <video
            src={clip.url}
            poster={poster}
            aria-label={title}
            ref={player}
            tabIndex={0}
            controls
            playsInline
            preload="metadata"
            onError={() => setFailed(true)}
          />
        )}
      </div>
      <figcaption>
        <div>
          <strong>{title}</strong>
          <p>{m[`video.article.media.${chapter}.note`]()}</p>
        </div>
        <a
          className="magi-text-link"
          href={clip.source}
          target="_blank"
          rel="noopener noreferrer"
        >
          {m[`video.article.media.source.${clip.publisher}`]()}{' '}
          <ArrowUpRight size={14} />
        </a>
        {failed && (
          <p className="magi-error" role="status">
            {m['video.article.media.error']()}
          </p>
        )}
      </figcaption>
    </figure>
  );
}

export function MagiEditorial() {
  return (
    <article
      id="magi-2-guide"
      className="magi-editorial magi-section"
      aria-labelledby="magi-editorial-title"
    >
      <header className="magi-editorial-head">
        <h2 id="magi-editorial-title">{m['video.article.title']()}</h2>
        <p>{m['video.article.lead']()}</p>
      </header>
      <nav
        className="magi-editorial-nav"
        aria-label={m['video.article.contents']()}
      >
        {chapters.map(([key]) => (
          <a key={key} href={`#magi-${key}`}>
            {m[`video.article.chapter.${key}`]()}
          </a>
        ))}
      </nav>
      <div className="magi-editorial-body">
        {chapters.map(([key, href]) => (
          <section
            className="magi-editorial-chapter"
            id={`magi-${key}`}
            key={key}
          >
            <div className="magi-editorial-copy">
              <h3>{m[`video.article.${key}.title`]()}</h3>
              <p>{m[`video.article.${key}.p1`]()}</p>
              <p>{m[`video.article.${key}.p2`]()}</p>
              {key === 'overview' ? (
                <div className="magi-inline-links">
                  <a className="magi-text-link" href={href}>
                    {m[`video.article.${key}.link`]()}{' '}
                    <ArrowUpRight size={15} />
                  </a>
                  <a className="magi-text-link" href={higgsfieldMagiDocs}>
                    {m['video.article.provider']()} <ArrowUpRight size={15} />
                  </a>
                </div>
              ) : (
                <div className="magi-inline-links">
                  <MagiLink href={href}>
                    {m[`video.article.${key}.link`]()}
                  </MagiLink>
                  {key === 'format' && (
                    <a
                      className="magi-text-link"
                      href="https://www.youtube.com/watch?v=lctGwH4wZ1o"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {m['video.article.format.tutorial']()}{' '}
                      <ArrowUpRight size={15} />
                    </a>
                  )}
                </div>
              )}
            </div>
            <ChapterVideo chapter={key} />
          </section>
        ))}
      </div>
    </article>
  );
}

const related = {
  text: '/prompts',
  image: '/guide#product',
  examples: '/prompts',
  prompts: '/guide',
  pricing: '/#studio',
} as const;

export function MagiInsight({ page }: { page: keyof typeof related }) {
  return (
    <section className="magi-insight">
      <h2>{m[`video.insight.${page}.title`]()}</h2>
      <div>
        <p>{m[`video.insight.${page}.p1`]()}</p>
        <p>{m[`video.insight.${page}.p2`]()}</p>
        <MagiLink href={related[page]}>
          {m[`video.insight.${page}.link`]()}
        </MagiLink>
      </div>
    </section>
  );
}
