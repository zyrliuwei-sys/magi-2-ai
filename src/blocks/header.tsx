import { m } from '@/paraglide/messages.js';
import { SiteHeader } from '@/components/site-header';

export function Header() {
  const navLinks = [
    { href: '/#studio', label: m['video.nav.studio']() },
    { href: '/examples', label: m['video.nav.examples']() },
    { href: '/guide', label: m['video.nav.guide']() },
    { href: '/pricing', label: m['landing.nav.pricing']() },
    { href: '/blog', label: m['landing.nav.blog']() },
  ];

  return <SiteHeader navLinks={navLinks} />;
}
