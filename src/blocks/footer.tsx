import { getRouteApi } from '@tanstack/react-router';

import { envConfigs } from '@/config';
import { openCookieSettings } from '@/lib/cookie-consent';
import { m } from '@/paraglide/messages.js';
import { FooterBadgeList } from '@/components/footer-badge-list';
import { SiteFooter, type FooterColumn } from '@/components/site-footer';

const rootRoute = getRouteApi('__root__');

export function Footer() {
  const cookieConsentEnabled =
    !!rootRoute.useLoaderData()?.cookieConsentEnabled;
  const columns: FooterColumn[] = [
    {
      title: m['video.brand.footer_studio'](),
      links: [
        { label: m['video.studio.text'](), href: '/text-to-video' },
        { label: m['video.studio.image'](), href: '/image-to-video' },
        { label: m['video.nav.pricing'](), href: '/pricing' },
      ],
    },
    {
      title: m['video.brand.footer_library'](),
      links: [
        { label: m['video.nav.examples'](), href: '/examples' },
        { label: m['video.nav.prompts'](), href: '/prompts' },
        { label: m['video.nav.guide'](), href: '/guide' },
        { label: m['blog.title'](), href: '/blog' },
      ],
    },
    {
      title: m['landing.footer.legal'](),
      links: [
        { label: m['landing.footer.privacy'](), href: '/privacy-policy' },
        { label: m['landing.footer.terms'](), href: '/terms-of-service' },
        {
          label: m['video.footer.support'](),
          href: `mailto:${envConfigs.support_email}`,
        },
        ...(cookieConsentEnabled
          ? [
              {
                label: m['landing.footer.cookie_settings'](),
                onClick: openCookieSettings,
              },
            ]
          : []),
      ],
    },
  ];

  return (
    <SiteFooter
      tagline={m['video.footer.about']()}
      columns={columns}
      badges={<FooterBadgeList className="mt-10" />}
    />
  );
}
