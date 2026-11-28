import { createFileRoute } from '@tanstack/react-router';

import { videoPacks } from '@/config/pricing';
import { m } from '@/paraglide/messages.js';
import { MagiPricing } from '@/blocks/magi-pricing';
import { magiHead, MagiIntro, MagiSite } from '@/blocks/magi-site';

function PricingPage() {
  const { pack, resume } = Route.useSearch();
  return (
    <MagiSite>
      <div className="magi-wrap">
        <MagiIntro
          title={m['video.page.pricing.title']()}
          description={m['video.page.pricing.description']()}
        />
        <MagiPricing selectedPack={pack} resume={resume} />
      </div>
    </MagiSite>
  );
}

export const Route = createFileRoute('/pricing')({
  validateSearch: (search: Record<string, unknown>) => ({
    pack: videoPacks.find(({ productId }) => search.pack === productId)
      ?.productId,
    resume:
      typeof search.resume === 'string' &&
      /^[0-9a-f-]{36}$/i.test(search.resume)
        ? search.resume
        : undefined,
  }),
  head: () =>
    magiHead(
      '/pricing',
      m['video.page.pricing.seo_title'](),
      m['video.page.pricing.seo_description']()
    ),
  component: PricingPage,
});
