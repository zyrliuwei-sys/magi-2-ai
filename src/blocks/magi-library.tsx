import { useId, useRef, useState } from 'react';
import { Link as RouterLink } from '@tanstack/react-router';
import {
  ArrowUpRight,
  Check,
  Clapperboard,
  Copy,
  ImagePlus,
  Play,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { flushSync } from 'react-dom';

import {
  higgsfieldMagiDocs,
  higgsfieldMagiIntro,
  magiExamples,
  magiGuides,
  magiHiggsfieldExamples,
  magiPrompts,
  magiReferences,
  magiStudioClips,
  sandMagiAnnouncement,
  type MagiPromptId,
} from '@/config/magi-content';
import { m } from '@/paraglide/messages.js';
import { MagiVideoPreview } from '@/components/magi-video-preview';

import { MagiIntro, MagiLink } from './magi-site';

export function StudioPromptLink({
  id,
  children,
}: {
  id: MagiPromptId;
  children: React.ReactNode;
}) {
  const mode = magiPrompts.find((prompt) => prompt.id === id)?.mode;
  return (
    <RouterLink
      to={mode === 'image-to-video' ? '/image-to-video' : '/text-to-video'}
      search={{ prompt: id }}
      hash="studio"
      className="magi-text-link"
    >
      {children}
      <ArrowUpRight size={15} />
    </RouterLink>
  );
}

type GalleryClip =
  (typeof magiExamples)[number] | ReturnType<typeof magiReferences>[number];

function galleryTitle(clip: GalleryClip) {
  return clip.kind === 'model'
    ? m[`video.example.${clip.id}.title`]()
    : m[`video.reference.${clip.id}.title`]();
}

export function MagiGallery({
  collection = 'examples',
}: {
  collection?: keyof typeof magiStudioClips | 'examples' | 'higgsfield';
}) {
  const [category, setCategory] = useState('all');
  const [selected, setSelected] = useState<GalleryClip>();
  const [failed, setFailed] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const dialogTitle = useId();
  const showcase = collection === 'higgsfield';
  const compact = collection !== 'examples';
  const ClipTitle = compact ? 'h3' : 'h2';
  const sectionTitle = showcase
    ? m['video.gallery.higgsfield.title']()
    : compact
      ? m['video.gallery.references']()
      : m['video.gallery.title']();
  const visible: GalleryClip[] = showcase
    ? magiHiggsfieldExamples
    : compact
      ? magiReferences(collection)
      : magiExamples.filter(
          (clip) => category === 'all' || clip.category === category
        );
  const filters = ['all', 'animation', 'character', 'camera'] as const;

  const player = useRef<HTMLVideoElement>(null);

  function openClip(clip: GalleryClip) {
    flushSync(() => {
      setFailed(false);
      setSelected(clip);
    });
    dialog.current?.showModal();
    void player.current?.play().catch(() => {
      // Native controls are available if the browser blocks playback.
    });
  }

  return (
    <section
      className={compact ? 'magi-section' : 'magi-library'}
      aria-label={sectionTitle}
    >
      {compact ? (
        <div className="magi-section-heading">
          <div>
            <h2>{sectionTitle}</h2>
            <p>
              {showcase
                ? m['video.gallery.higgsfield.description']()
                : m[`video.gallery.references.${collection}`]()}
            </p>
          </div>
          <MagiLink href="/examples">{m['video.gallery.all']()}</MagiLink>
        </div>
      ) : (
        <div
          className="magi-filter"
          role="group"
          aria-label={m['video.gallery.filters']()}
        >
          {filters.map((filter) => (
            <button
              key={filter}
              type="button"
              aria-pressed={category === filter}
              onClick={() => setCategory(filter)}
            >
              {m[`video.category.${filter}`]()}
            </button>
          ))}
        </div>
      )}
      <div
        className="magi-gallery"
        data-layout={
          showcase
            ? undefined
            : compact
              ? 'screening'
              : category === 'all'
                ? 'archive'
                : undefined
        }
      >
        {visible.map((clip) => {
          const title = galleryTitle(clip);
          return (
            <article className="magi-clip" key={clip.id}>
              <button
                className="magi-clip-image"
                type="button"
                onClick={() => openClip(clip)}
                aria-label={m['video.gallery.watch']({ name: title })}
              >
                {selected?.id !== clip.id && (
                  <MagiVideoPreview
                    src={clip.video}
                    poster={clip.poster}
                    paused={!!selected}
                  />
                )}
                <span aria-hidden="true">
                  <Play size={18} fill="currentColor" />
                </span>
              </button>
              <div className="magi-clip-text">
                <ClipTitle>{title}</ClipTitle>
                <span>
                  {clip.kind === 'model'
                    ? m[`video.category.${clip.category}`]()
                    : m['video.media.filmed']()}
                </span>
              </div>
              {clip.kind === 'model' && (
                <p>{m[`video.example.${clip.id}.description`]()}</p>
              )}
            </article>
          );
        })}
      </div>
      {!compact && (
        <div className="magi-inline-links magi-source">
          <a
            className="magi-text-link"
            href={sandMagiAnnouncement}
            target="_blank"
            rel="noopener noreferrer"
          >
            {m['video.gallery.official']()} <ArrowUpRight size={15} />
          </a>
          <a
            className="magi-text-link"
            href={higgsfieldMagiIntro}
            target="_blank"
            rel="noopener noreferrer"
          >
            {m['video.gallery.higgsfield.source']()} <ArrowUpRight size={15} />
          </a>
        </div>
      )}
      <dialog
        className="magi-dialog"
        ref={dialog}
        onClose={() => setSelected(undefined)}
        aria-labelledby={dialogTitle}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        {selected && (
          <div className="magi-dialog-inner">
            <div className="magi-dialog-title">
              <h2 id={dialogTitle}>{galleryTitle(selected)}</h2>
              <button
                type="button"
                className="magi-icon-button"
                aria-label={m['video.gallery.close']()}
                onClick={() => dialog.current?.close()}
              >
                <X size={21} />
              </button>
            </div>
            <video
              key={selected.id}
              ref={player}
              controls
              playsInline
              preload="metadata"
              controlsList="nodownload"
              src={selected.video}
              poster={selected.poster}
              aria-label={galleryTitle(selected)}
              onError={() => setFailed(true)}
            />
            <div className="magi-dialog-copy">
              {failed && (
                <p className="magi-error" role="status">
                  {m['video.article.media.error']()}
                </p>
              )}
              {selected.kind === 'model' ? (
                <>
                  <p>{m[`video.example.${selected.id}.description`]()}</p>
                  {selected.publisher === 'sand' && (
                    <p>
                      <strong>{m['video.gallery.input']()}</strong>
                      <br />
                      {m[`video.example.${selected.id}.input`]()}{' '}
                      {m['video.gallery.unpublished']()}
                    </p>
                  )}
                </>
              ) : (
                <p>{m[`video.reference.${selected.id}.description`]()}</p>
              )}
              <div className="magi-inline-links">
                {selected.prompt && (
                  <StudioPromptLink id={selected.prompt}>
                    {m['video.gallery.prompt']()}
                  </StudioPromptLink>
                )}
                {selected.kind === 'model' && (
                  <a
                    className="magi-text-link"
                    href={selected.video}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {m['video.gallery.fallback']()} <ArrowUpRight size={15} />
                  </a>
                )}
                <a
                  className="magi-text-link"
                  href={selected.source}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {selected.kind === 'model'
                    ? selected.publisher === 'higgsfield'
                      ? m['video.gallery.higgsfield.source']()
                      : m['video.gallery.official']()
                    : m['video.media.pexels']()}{' '}
                  <ArrowUpRight size={15} />
                </a>
              </div>
            </div>
          </div>
        )}
      </dialog>
    </section>
  );
}

function PromptCard({ prompt }: { prompt: (typeof magiPrompts)[number] }) {
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');
  const text = m[`video.prompt.${prompt.id}.text`]();
  const Icon = prompt.mode === 'image-to-video' ? ImagePlus : Clapperboard;
  return (
    <article className="magi-prompt-card">
      <span className="magi-panel-icon">
        <Icon size={19} />
      </span>
      <h3>{m[`video.prompt.${prompt.id}.title`]()}</h3>
      <p>{text}</p>
      <div className="magi-prompt-actions">
        <StudioPromptLink id={prompt.id}>
          {m['video.prompts.use']()}
        </StudioPromptLink>
        <button
          type="button"
          className="magi-button magi-button-outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopy('copied');
            } catch {
              setCopy('failed');
            }
          }}
        >
          {copy === 'copied' ? <Check size={15} /> : <Copy size={15} />}
          {copy === 'copied'
            ? m['video.prompts.copied']()
            : m['video.prompts.copy']()}
        </button>
      </div>
      {copy === 'failed' && (
        <p role="status">{m['video.prompts.copy_failed']()}</p>
      )}
    </article>
  );
}

export function MagiPromptLibrary({
  compact = false,
  mode,
}: {
  compact?: boolean;
  mode?: 'text-to-video' | 'image-to-video';
}) {
  const [category, setCategory] = useState('all');
  const filters = [
    'all',
    'product',
    'character',
    'camera',
    'animation',
  ] as const;
  const matches = magiPrompts.filter(
    (prompt) =>
      (!mode || prompt.mode === mode) &&
      (category === 'all' || prompt.category === category)
  );
  const visible = compact ? matches.slice(0, 3) : matches;
  return (
    <section
      className={compact ? 'magi-section' : 'magi-library'}
      aria-label={m['video.page.prompts.title']()}
    >
      {compact ? (
        <div className="magi-section-heading">
          <div>
            <h2>{m['video.prompts.home_title']()}</h2>
            <p>{m['video.prompts.home_description']()}</p>
          </div>
          <MagiLink href="/prompts">{m['video.studio.templates']()}</MagiLink>
        </div>
      ) : (
        <>
          <div
            className="magi-filter"
            aria-label={m['video.page.prompts.title']()}
          >
            {filters.map((filter) => (
              <button
                key={filter}
                type="button"
                aria-pressed={category === filter}
                onClick={() => setCategory(filter)}
              >
                {m[`video.category.${filter}`]()}
              </button>
            ))}
          </div>
          <p className="magi-note magi-library-note">
            {m['video.prompts.drafts']()}
          </p>
        </>
      )}
      <div
        className="magi-prompt-grid"
        data-layout={compact ? 'compact' : 'library'}
      >
        {visible.map((prompt) => (
          <PromptCard key={prompt.id} prompt={prompt} />
        ))}
      </div>
    </section>
  );
}

export function MagiHow() {
  const items = [
    ['input', ImagePlus],
    ['format', SlidersHorizontal],
    ['export', Clapperboard],
  ] as const;
  return (
    <section className="magi-section magi-how">
      <div>
        <h2>{m['video.how.title']()}</h2>
        <MagiLink href="/guide">{m['video.nav.guide']()}</MagiLink>
      </div>
      <div className="magi-how-list">
        {items.map(([key, Icon]) => (
          <article key={key}>
            <span className="magi-panel-icon">
              <Icon size={19} />
            </span>
            <div>
              <h3>{m[`video.how.${key}_title`]()}</h3>
              <p>{m[`video.how.${key}_text`]()}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function MagiFAQ() {
  const keys = [
    'model',
    'audio',
    'length',
    'image',
    'credits',
    'free',
    'retention',
  ] as const;
  return (
    <section className="magi-section magi-faq">
      <h2>{m['video.faq.title']()}</h2>
      <div>
        {keys.map((key) => (
          <details key={key}>
            <summary>{m[`video.faq.${key}.q`]()}</summary>
            <p>{m[`video.faq.${key}.a`]()}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function MagiGuide() {
  return (
    <div className="magi-wrap">
      <MagiIntro
        title={m['video.page.guide.title']()}
        description={m['video.page.guide.description']()}
      />
      <div className="magi-guide">
        <nav aria-label={m['video.nav.guide']()}>
          {magiGuides.map((id) => (
            <a key={id} className="magi-text-link" href={`#${id}`}>
              {m[`video.guide.${id}.title`]()}
            </a>
          ))}
        </nav>
        <div>
          {magiGuides.map((id, index) => (
            <article key={id} id={id} className="magi-guide-article">
              <h2>{m[`video.guide.${id}.title`]()}</h2>
              <p>{m[`video.guide.${id}.intro`]()}</p>
              <ol>
                {([1, 2, 3] as const).map((step) => (
                  <li key={step}>{m[`video.guide.${id}.step${step}`]()}</li>
                ))}
              </ol>
              <StudioPromptLink
                id={(['orbit', 'night', 'dialogue'] as const)[index]}
              >
                {m['video.prompts.use']()}
              </StudioPromptLink>
            </article>
          ))}
          <article className="magi-guide-article">
            <h2>{m['video.guide.about.title']()}</h2>
            <p>{m['video.guide.about.text']()}</p>
            <div className="magi-inline-links">
              <a className="magi-text-link" href={sandMagiAnnouncement}>
                {m['video.guide.about.sand']()} <ArrowUpRight size={15} />
              </a>
              <a className="magi-text-link" href={higgsfieldMagiDocs}>
                {m['video.guide.about.hf']()} <ArrowUpRight size={15} />
              </a>
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}
