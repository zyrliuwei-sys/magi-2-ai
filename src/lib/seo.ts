import { envConfigs } from '@/config';
import { m } from '@/paraglide/messages.js';
import { baseLocale } from '@/paraglide/runtime.js';

export function publicPageHead(
  path: string,
  title: string,
  description: string,
  type: 'website' | 'article' = 'website'
) {
  const canonical = new URL(path, envConfigs.app_url).href;
  const image = new URL('/imgs/magi/share-card.jpg', envConfigs.app_url).href;
  const imageAlt = m['video.brand.share_alt']();
  return {
    meta: [
      { title },
      { name: 'description', content: description },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:url', content: canonical },
      { property: 'og:type', content: type },
      { property: 'og:site_name', content: envConfigs.app_name },
      { property: 'og:image', content: image },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { property: 'og:image:alt', content: imageAlt },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
      { name: 'twitter:image', content: image },
      { name: 'twitter:image:alt', content: imageAlt },
    ],
    links: [
      { rel: 'canonical', href: canonical },
      { rel: 'alternate', hrefLang: baseLocale, href: canonical },
    ],
  };
}

export function jsonLd(value: Record<string, unknown>) {
  return {
    type: 'application/ld+json',
    children: JSON.stringify(value).replace(/</g, '\\u003c'),
  };
}

export function privatePageHead(title: string, description?: string) {
  return {
    meta: [
      { title: `${title} | ${envConfigs.app_name}` },
      { name: 'robots', content: 'noindex, nofollow' },
      ...(description ? [{ name: 'description', content: description }] : []),
    ],
  };
}
