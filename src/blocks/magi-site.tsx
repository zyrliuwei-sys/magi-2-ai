import { useRef, type ReactNode } from 'react';
import { getRouteApi } from '@tanstack/react-router';
import { ArrowRight, ArrowUpRight, Menu } from 'lucide-react';

import { useSession } from '@/core/auth/client';
import { Link, usePathname } from '@/core/i18n/navigation';
import { envConfigs } from '@/config';
import { openCookieSettings } from '@/lib/cookie-consent';
import { m } from '@/paraglide/messages.js';
import { useUserPermissions } from '@/hooks/use-user-permissions';
import { FooterBadgeList } from '@/components/footer-badge-list';

export { publicPageHead as magiHead } from '@/lib/seo';

const rootRoute = getRouteApi('__root__');

const mainLinks = [
  ['studio', '/'],
  ['examples', '/examples'],
  ['prompts', '/prompts'],
  ['pricing', '/pricing'],
  ['guide', '/guide'],
] as const;

export function MagiHeader() {
  const pathname = usePathname();
  const menu = useRef<HTMLDetailsElement>(null);
  const { data: session } = useSession();
  const { data: permissions } = useUserPermissions();
  const closeMenu = () => {
    if (menu.current) menu.current.open = false;
  };
  const nav = mainLinks.map(([key, href]) => (
    <Link
      key={key}
      href={href}
      onClick={closeMenu}
      aria-current={
        href === pathname ||
        (key === 'studio' &&
          ['/text-to-video', '/image-to-video'].includes(pathname))
          ? 'page'
          : undefined
      }
    >
      {m[`video.nav.${key}`]()}
    </Link>
  ));
  const accountLinks = session?.user
    ? [{ href: '/settings/videos', label: m['video.nav.history']() }]
    : [{ href: '/sign-in', label: m['video.nav.signin']() }];
  if (session?.user && permissions?.isAdmin === true) {
    accountLinks.push({ href: '/admin', label: m['common.systems.admin']() });
  }
  return (
    <header className="magi-header">
      <div className="magi-wrap magi-header-inner">
        <Link href="/" className="magi-brand">
          <img src={envConfigs.app_logo} alt="" width={40} height={40} />
          <span>{envConfigs.app_name}</span>
        </Link>
        <nav
          className="magi-desktop-nav"
          aria-label={m['video.brand.main_nav']()}
        >
          {nav}
        </nav>
        <div className="magi-header-actions">
          {accountLinks.map(({ href, label }) => (
            <Link key={href} href={href} className="magi-account">
              {label}
            </Link>
          ))}
          <Link
            href={
              ['/', '/image-to-video', '/text-to-video'].includes(pathname)
                ? '#studio'
                : '/#studio'
            }
            className="magi-button magi-button-primary"
          >
            {m['video.brand.cta']()} <ArrowUpRight size={15} />
          </Link>
          <details className="magi-mobile-nav" ref={menu}>
            <summary
              className="magi-icon-button"
              aria-label={m['video.nav.menu']()}
            >
              <Menu size={21} />
            </summary>
            <nav>
              {nav}
              {accountLinks.map(({ href, label }) => (
                <Link key={href} href={href} onClick={closeMenu}>
                  {label}
                </Link>
              ))}
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}

export function MagiFooter() {
  const cookieConsentEnabled = rootRoute.useLoaderData()?.cookieConsentEnabled;
  return (
    <footer className="magi-footer">
      <div className="magi-wrap magi-footer-inner">
        <div>
          <Link href="/" className="magi-brand">
            <img src={envConfigs.app_logo} alt="" width={34} height={34} />
            <span>{envConfigs.app_name}</span>
          </Link>
          <p>{m['video.footer.about']()}</p>
        </div>
        <nav aria-label={m['video.brand.footer_nav']()}>
          <div>
            <p>{m['video.brand.footer_studio']()}</p>
            <Link href="/text-to-video">{m['video.studio.text']()}</Link>
            <Link href="/image-to-video">{m['video.studio.image']()}</Link>
            <Link href="/pricing">{m['video.nav.pricing']()}</Link>
          </div>
          <div>
            <p>{m['video.brand.footer_library']()}</p>
            <Link href="/examples">{m['video.nav.examples']()}</Link>
            <Link href="/prompts">{m['video.nav.prompts']()}</Link>
            <Link href="/guide">{m['video.nav.guide']()}</Link>
            <Link href="/blog">{m['blog.title']()}</Link>
          </div>
          <div>
            <p>{m['video.brand.footer_site']()}</p>
            <Link href="/privacy-policy">{m['video.footer.privacy']()}</Link>
            <Link href="/terms-of-service">{m['video.footer.terms']()}</Link>
            <a href={`mailto:${envConfigs.support_email}`}>
              {m['video.footer.support']()}
            </a>
            {cookieConsentEnabled && (
              <button type="button" onClick={openCookieSettings}>
                {m['landing.footer.cookie_settings']()}
              </button>
            )}
          </div>
        </nav>
      </div>
      <div className="magi-wrap">
        <FooterBadgeList className="pb-8" showDefaults={false} />
      </div>
    </footer>
  );
}

export function MagiSite({ children }: { children: ReactNode }) {
  return (
    <div className="magi-site">
      <MagiHeader />
      <main>{children}</main>
      <MagiFooter />
    </div>
  );
}

export function MagiHomeIntro() {
  return (
    <header className="magi-home-intro">
      <h1>
        <span>{m['video.home.topic']()}</span>{' '}
        <span>{m['video.home.tool']()}</span>
      </h1>
      <p>{m['video.home.description']()}</p>
      <MagiLink href="#magi-overview">
        {m['video.article.overview.title']()}
      </MagiLink>
    </header>
  );
}

export function MagiIntro({
  title,
  description,
  studio = false,
}: {
  title: string;
  description: string;
  studio?: boolean;
}) {
  return (
    <div className={studio ? 'magi-intro magi-studio-intro' : 'magi-intro'}>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  );
}

export function MagiLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className="magi-text-link">
      {children}
      <ArrowRight size={17} />
    </Link>
  );
}

const relatedTopics = {
  examples: ['examples', '/examples'],
  text: ['text', '/text-to-video'],
  image: ['image', '/image-to-video'],
  guide: ['guide', '/guide'],
  prompts: ['prompts', '/prompts'],
  preview: ['model_preview', '/magi-2-preview'],
} as const;

export function MagiRelated({
  topics,
}: {
  topics: readonly (keyof typeof relatedTopics)[];
}) {
  return (
    <section
      className="magi-section magi-related"
      aria-labelledby="magi-related"
    >
      <h2 id="magi-related">{m['video.related.title']()}</h2>
      <ul className="magi-inline-links">
        {topics.map((topic) => {
          const [label, href] = relatedTopics[topic];
          return (
            <li key={topic}>
              <MagiLink href={href}>
                {label === 'text' || label === 'image'
                  ? m[`video.studio.${label}`]()
                  : m[`video.nav.${label}`]()}
              </MagiLink>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
