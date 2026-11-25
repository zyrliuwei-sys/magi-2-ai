import { ArrowUpRight } from 'lucide-react';

import {
  higgsfieldMagiDocs,
  higgsfieldMagiIntro,
  magiGuideClips,
  magiReferences,
  magiStudioClips,
  sandMagiAnnouncement,
  sandMagiPreview,
  sandMagiPreviewRepo,
  sandMagiSite,
} from '@/config/magi-content';
import { m } from '@/paraglide/messages.js';

type SourcesPage = 'home' | 'text' | 'image' | 'examples' | 'guide' | 'preview';

function sourcesFor(page: SourcesPage) {
  const launch = {
    href: sandMagiAnnouncement,
    label: m['video.gallery.official'](),
  };
  const research = {
    href: sandMagiPreview,
    label: m['video.sources.research'](),
  };
  const showcase = {
    href: higgsfieldMagiIntro,
    label: m['video.gallery.higgsfield.source'](),
  };
  const api = { href: higgsfieldMagiDocs, label: m['video.article.provider']() };
  if (page === 'examples') return [launch, showcase];
  if (page === 'guide') return [launch, api];
  if (page === 'preview') {
    return [
      research,
      launch,
      { href: sandMagiSite, label: m['video.sources.sand_site']() },
      { href: sandMagiPreviewRepo, label: m['video.sources.preview_code']() },
      showcase,
    ];
  }

  const stockFootage = [
    ...magiStudioClips[page]
      .filter((clip) => clip.publisher === 'pexels')
      .map((clip) => ({
        href: clip.source,
        label: m['video.sources.footage']({
          title: m[`video.studio.reference.${clip.label}`](),
        }),
      })),
    ...magiReferences(page)
      .filter((clip) => clip.kind === 'stock')
      .map((clip) => ({
        href: clip.source,
        label: m['video.sources.footage']({
          title: m[`video.reference.${clip.id}.title`](),
        }),
      })),
  ];
  if (page !== 'home') return stockFootage;

  return [
    research,
    launch,
    showcase,
    api,
    { href: magiGuideClips.text.source, label: m['video.sources.playground']() },
    { href: magiGuideClips.image.source, label: m['video.sources.beauty']() },
    {
      href: 'https://www.youtube.com/watch?v=lctGwH4wZ1o',
      label: m['video.article.format.tutorial'](),
    },
    ...stockFootage,
  ];
}

export function MagiSources({ page }: { page: SourcesPage }) {
  return (
    <section
      id="magi-sources"
      className="magi-section magi-sources"
      aria-labelledby="magi-sources-title"
    >
      <h2 id="magi-sources-title">{m['video.sources.title']()}</h2>
      <ul className="magi-inline-links">
        {sourcesFor(page).map(({ href, label }) => (
          <li key={href}>
            <a
              href={href}
              className="magi-text-link"
              target="_blank"
              rel="nofollow noopener"
            >
              {label} <ArrowUpRight size={14} />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
