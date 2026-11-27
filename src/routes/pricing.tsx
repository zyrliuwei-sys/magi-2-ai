import { createFileRoute } from '@tanstack/react-router';

import { m } from '@/paraglide/messages.js';
import { MagiInsight } from '@/blocks/magi-editorial';
import { MagiPricing } from '@/blocks/magi-pricing';
import { magiHead, MagiIntro, MagiSite } from '@/blocks/magi-site';

function PricingPage() {
  return (
    <MagiSite>
      <div className="magi-wrap">
        <MagiIntro
          title={m['video.page.pricing.title']()}
          description={m['video.page.pricing.description']()}
        />
        <MagiPricing />
        <MagiInsight page="pricing" />
      </div>
    </MagiSite>
  );
}

export const Route = createFileRoute('/pricing')({
  head: () =>
    magiHead(
      '/pricing',
      m['video.page.pricing.seo_title'](),
      m['video.page.pricing.seo_description']()
    ),
  component: PricingPage,
});
