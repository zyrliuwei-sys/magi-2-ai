import { createFileRoute } from '@tanstack/react-router';

import { envConfigs } from '@/config';
import { publicPageHead } from '@/lib/seo';
import { m } from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';
import { Footer } from '@/blocks/footer';
import { GuestPostLanding } from '@/blocks/guest-post';
import { Header } from '@/blocks/header';

export const Route = createFileRoute('/guest-post')({
  loader: () => {
    const locale = getLocale();
    return {
      title: m['guest_posts.landing.title']({}, { locale }),
      description: m['guest_posts.landing.description']({}, { locale }),
    };
  },
  head: ({ loaderData }) =>
    loaderData
      ? publicPageHead(
          '/guest-post',
          `${loaderData.title} | ${envConfigs.app_name}`,
          loaderData.description
        )
      : {},
  component: GuestPostPage,
});

function GuestPostPage() {
  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <GuestPostLanding />
      </main>
      <Footer />
    </div>
  );
}
