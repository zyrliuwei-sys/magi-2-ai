import { createFileRoute } from '@tanstack/react-router';

import { serverSiteOrigin } from '@/lib/site-origin';
import { baseLocale, locales, localizeUrl } from '@/paraglide/runtime.js';
import { getLocalPosts, mergePosts } from '@/content/posts';

// Date of the most recent substantive content edit on each static page.
const STATIC_LAST_MODIFIED = {
  '': '2026-11-26',
  '/pricing': '2026-11-25',
  '/text-to-video': '2026-11-26',
  '/image-to-video': '2026-11-26',
  '/examples': '2026-11-25',
  '/prompts': '2026-11-25',
  '/guide': '2026-11-26',
  '/magi-2-preview': '2026-11-25',
  '/privacy-policy': '2026-11-25',
  '/terms-of-service': '2026-11-26',
} satisfies Record<string, string>;

const POLICY_PATHS = new Set(['/privacy-policy', '/terms-of-service']);

type Entry = {
  path: string;
  lastModified: string;
  changeFrequency: string;
  priority: number;
};

function urlFor(path: string, locale: string, origin: string): string {
  return localizeUrl(`${origin}${path || '/'}`, {
    locale: locale as (typeof locales)[number],
  }).href;
}

function xmlText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function entryXml(e: Entry, origin: string): string {
  const alternates = locales
    .map(
      (loc) =>
        `    <xhtml:link rel="alternate" hreflang="${loc}" href="${xmlText(urlFor(e.path, loc, origin))}"/>`
    )
    .join('\n');
  return [
    '  <url>',
    `    <loc>${xmlText(urlFor(e.path, baseLocale, origin))}</loc>`,
    alternates,
    `    <lastmod>${xmlText(e.lastModified)}</lastmod>`,
    `    <changefreq>${e.changeFrequency}</changefreq>`,
    `    <priority>${e.priority}</priority>`,
    '  </url>',
  ].join('\n');
}

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: async () => {
        const entries: Entry[] = Object.entries(STATIC_LAST_MODIFIED).map(
          ([path, lastModified]) => ({
            path,
            lastModified,
            changeFrequency: POLICY_PATHS.has(path) ? 'yearly' : 'weekly',
            priority: path === '' ? 1 : POLICY_PATHS.has(path) ? 0.3 : 0.8,
          })
        );
        const localPosts = getLocalPosts(baseLocale);
        let posts = localPosts;

        // Blog posts: db posts merged with local MDX posts.
        try {
          const { listPublishedArticles } =
            await import('@/modules/posts/service');
          const { getConfig } = await import('@/modules/config/service');
          const [rows, guestPostsEnabled] = await Promise.all([
            listPublishedArticles().catch(() => []),
            getConfig('guest_post_enabled').catch(() => undefined),
          ]);
          if (guestPostsEnabled === 'true') {
            entries.push({
              path: '/guest-post',
              lastModified: '2026-11-25',
              changeFrequency: 'weekly',
              priority: 0.6,
            });
          }
          const dbPosts = rows.map((row) => ({
            slug: row.slug,
            title: row.title || row.slug,
            description: row.description || '',
            createdAt: new Date(row.createdAt).toISOString(),
            updatedAt: new Date(row.updatedAt).toISOString(),
            source: 'db' as const,
          }));
          posts = mergePosts(dbPosts, localPosts);
        } catch {
          // Keep static pages and local posts available during a database outage.
        }

        let blogLastModified = '';
        for (const post of posts) {
          const lastModified = (post.updatedAt ?? post.createdAt).slice(0, 10);
          if (lastModified > blogLastModified) blogLastModified = lastModified;
          entries.push({
            path: `/blog/${encodeURIComponent(post.slug)}`,
            lastModified,
            changeFrequency: 'monthly',
            priority: 0.6,
          });
        }
        if (blogLastModified) {
          entries.push({
            path: '/blog',
            lastModified: blogLastModified,
            changeFrequency: 'weekly',
            priority: 0.8,
          });
        }

        const origin = serverSiteOrigin();
        const xml = [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
          ...entries.map((entry) => entryXml(entry, origin)),
          '</urlset>',
          '',
        ].join('\n');

        return new Response(xml, {
          headers: { 'Content-Type': 'application/xml' },
        });
      },
    },
  },
});
