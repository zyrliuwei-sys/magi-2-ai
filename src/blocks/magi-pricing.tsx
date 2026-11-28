import { useEffect, useState } from 'react';
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
import {
  firstVideoPack,
  formatVideoPackPrice,
  videoPacks,
} from '@/config/pricing';
import { apiPost } from '@/lib/api-client';
import { track } from '@/lib/track';
import { readVideoDraft, studioDraftUrl } from '@/lib/video-draft';
import { m } from '@/paraglide/messages.js';
import { usePublicConfig } from '@/hooks/use-public-config';
import { useVideoPurchase } from '@/hooks/use-video-purchase';

import { MagiLink } from './magi-site';

const checkoutIntentKey = 'magi-checkout-intent';
const intentLifetimeMs = 30 * 60 * 1000;

const includedFeatures = [
  ['text', Type],
  ['image', ImagePlus],
  ['sound', AudioLines],
  ['framing', Proportions],
  ['seed', SlidersHorizontal],
  ['export', Download],
] as const;

export function MagiPricing({
  embedded = false,
  selectedPack,
  resume,
}: {
  embedded?: boolean;
  selectedPack?: string;
  resume?: string;
}) {
  const { data: config, isError: configError } = usePublicConfig();
  const PlanTitle = embedded ? 'h3' : 'h2';
  const { data: session, isPending: sessionPending } = useSession();
  const [draftUrl, setDraftUrl] = useState<string>();
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
        locale: 'en',
      }),
    onSuccess: ({ checkout_url }, id) => {
      if (checkout_url?.startsWith('https://')) {
        track('checkout_redirected', { productId: id });
        window.location.assign(checkout_url);
      }
    },
  });
  const { mutate: openCheckout } = checkout;

  useEffect(() => {
    if (embedded) return;
    const draft = readVideoDraft();
    if (draft) setDraftUrl(studioDraftUrl(draft.path));
  }, [embedded]);

  useEffect(() => {
    if (
      !session?.user ||
      !stripeEnabled ||
      !selectedPack ||
      !resume ||
      (selectedPack === firstVideoPack.productId && purchase.isPending) ||
      (selectedPack === firstVideoPack.productId &&
        purchase.data?.firstPurchaseEligible === false)
    )
      return;
    try {
      const saved = JSON.parse(
        sessionStorage.getItem(checkoutIntentKey) || 'null'
      );
      if (
        saved?.id !== selectedPack ||
        saved.token !== resume ||
        typeof saved.at !== 'number' ||
        Date.now() - saved.at > intentLifetimeMs
      )
        return;
      sessionStorage.removeItem(checkoutIntentKey);
    } catch {
      return;
    }
    track('plan_selected', { productId: selectedPack });
    openCheckout(selectedPack);
  }, [
    session?.user.id,
    stripeEnabled,
    selectedPack,
    resume,
    purchase.isPending,
    purchase.data?.firstPurchaseEligible,
    openCheckout,
  ]);

  function buy(id: string) {
    if (!stripeEnabled || sessionPending || checkout.isPending) return;
    if (!session?.user) {
      const search = new URLSearchParams({ pack: id });
      try {
        const token = crypto.randomUUID();
        sessionStorage.setItem(
          checkoutIntentKey,
          JSON.stringify({ id, token, at: Date.now() })
        );
        search.set('resume', token);
      } catch {
        // The pricing page can still highlight the selected pack after sign-in.
      }
      router.push(
        `/sign-in?callbackUrl=${encodeURIComponent(`/pricing?${search}`)}`
      );
      return;
    }
    track('plan_selected', { productId: id });
    openCheckout(id);
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
          <article
            className="magi-price-card"
            key={pack.productId}
            data-selected={selectedPack === pack.productId || undefined}
          >
            <PlanTitle>{m[`video.pricing.pack.${pack.tier}`]()}</PlanTitle>
            <div className="magi-plan-price">
              <strong>{formatVideoPackPrice(pack.priceInCents)}</strong>
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
              disabled={!stripeEnabled || sessionPending || checkout.isPending}
              type="button"
              onClick={() => buy(pack.productId)}
            >
              {checkout.isPending && checkout.variables === pack.productId
                ? m['video.pricing.opening_checkout']()
                : selectedPack === pack.productId
                  ? m['video.pricing.continue_checkout']()
                  : m['video.pricing.buy_pack']()}{' '}
              <ArrowUpRight size={15} />
            </button>
          </article>
        ))}
      </div>
      <p className="magi-note">{m['video.pricing.render_policy']()}</p>
      {draftUrl && (
        <MagiLink href={draftUrl}>
          {m['video.pricing.back_to_draft']()}
        </MagiLink>
      )}
      {selectedPack === firstVideoPack.productId &&
        purchase.data?.firstPurchaseEligible === false && (
          <p className="magi-note" role="status">
            {m['video.pricing.first_pack_unavailable']()}
          </p>
        )}
      {(config || configError) && !stripeEnabled && (
        <p className="magi-note magi-library-note">
          {m['video.pricing.offline']()}
        </p>
      )}
      {(checkout.isError ||
        (checkout.isSuccess &&
          !checkout.data.checkout_url?.startsWith('https://'))) && (
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
