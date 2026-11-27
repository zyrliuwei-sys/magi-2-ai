import { useMutation } from '@tanstack/react-query';
import {
  ArrowUpRight,
  AudioLines,
  Check,
  Download,
  ImagePlus,
  Proportions,
  SlidersHorizontal,
  Type,
} from 'lucide-react';

import { useSession } from '@/core/auth/client';
import { useRouter } from '@/core/i18n/navigation';
import { firstVideoPack, videoPacks } from '@/config/pricing';
import { apiPost } from '@/lib/api-client';
import { m } from '@/paraglide/messages.js';
import { usePublicConfig } from '@/hooks/use-public-config';
import { useVideoPurchase } from '@/hooks/use-video-purchase';

import { MagiLink } from './magi-site';

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const includedFeatures = [
  ['text', Type],
  ['image', ImagePlus],
  ['sound', AudioLines],
  ['framing', Proportions],
  ['seed', SlidersHorizontal],
  ['export', Download],
] as const;

export function MagiPricing({ embedded = false }: { embedded?: boolean }) {
  const { data: config, isError: configError } = usePublicConfig();
  const PlanTitle = embedded ? 'h3' : 'h2';
  const { data: session } = useSession();
  const purchase = useVideoPurchase(session?.user?.id);
  const router = useRouter();
  const stripeEnabled = config?.stripe_enabled === 'true';
  const packs =
    purchase.data?.firstPurchaseEligible === false
      ? videoPacks.filter((pack) => pack.productId !== firstVideoPack.productId)
      : videoPacks;
  const checkout = useMutation({
    mutationFn: (id: string) =>
      apiPost<{ checkout_url?: string }>('/api/payment/checkout', {
        product_id: id,
        payment_provider: 'stripe',
        redirect: '/settings/videos',
        locale: 'en',
      }),
    onSuccess: ({ checkout_url }) => {
      if (checkout_url && /^https?:\/\//.test(checkout_url))
        window.location.assign(checkout_url);
    },
  });

  function buy(id: string) {
    if (!stripeEnabled) return;
    if (!session?.user) {
      router.push('/sign-in?callbackUrl=%2Fpricing');
      return;
    }
    checkout.mutate(id);
  }

  return (
    <section
      className="magi-library"
      aria-label={embedded ? undefined : m['video.page.pricing.title']()}
      aria-labelledby={embedded ? 'home-pricing-title' : undefined}
    >
      {embedded && (
        <div className="magi-section-heading">
          <div>
            <h2 id="home-pricing-title">{m['video.page.pricing.title']()}</h2>
            <p>{m['video.page.pricing.description']()}</p>
          </div>
        </div>
      )}
      <div className="magi-price-grid" aria-live="polite">
        {packs.map((pack) => (
          <article className="magi-price-card" key={pack.productId}>
            <PlanTitle>{m[`video.pricing.pack.${pack.tier}`]()}</PlanTitle>
            <div className="magi-plan-price">
              <strong>{usd.format(pack.priceInCents / 100)}</strong>
              <span>{m['video.pricing.once']()}</span>
            </div>
            <div className="magi-plan-allowance">
              <p>
                <Check size={16} aria-hidden="true" />{' '}
                {pack.clips === 1
                  ? m['video.pricing.allowance.one']()
                  : m['video.pricing.allowance.many']({ count: pack.clips })}
              </p>
              {pack.tier === 'first' && (
                <p>{m['video.pricing.first_pack_terms']()}</p>
              )}
            </div>
            <button
              className="magi-button magi-button-primary"
              disabled={!stripeEnabled || checkout.isPending}
              type="button"
              onClick={() => buy(pack.productId)}
            >
              {m['video.pricing.buy_pack']()} <ArrowUpRight size={15} />
            </button>
          </article>
        ))}
      </div>
      <p className="magi-note">{m['video.pricing.render_policy']()}</p>
      {(config || configError) && !stripeEnabled && (
        <p className="magi-note magi-library-note">
          {m['video.pricing.offline']()}
        </p>
      )}
      {(checkout.isError ||
        (checkout.isSuccess && !checkout.data.checkout_url)) && (
        <p role="alert" className="magi-error">
          {checkout.variables === firstVideoPack.productId &&
          checkout.error?.message ===
            m['video.pricing.first_pack_unavailable']()
            ? checkout.error.message
            : m['video.pricing.failed']()}
        </p>
      )}
      <section
        className="magi-pricing-inclusions"
        aria-labelledby="pricing-inclusions-title"
      >
        <h2 id="pricing-inclusions-title">
          {m['video.pricing.inclusions.title']()}
        </h2>
        <dl className="magi-price-grid">
          {includedFeatures.map(([feature, Icon]) => (
            <div key={feature}>
              <dt>
                <Icon size={18} aria-hidden="true" />
                {m[`video.pricing.inclusions.${feature}.title`]()}
              </dt>
              <dd>{m[`video.pricing.inclusions.${feature}.text`]()}</dd>
            </div>
          ))}
        </dl>
        <MagiLink href="/#studio">{m['video.brand.cta']()}</MagiLink>
      </section>
    </section>
  );
}
