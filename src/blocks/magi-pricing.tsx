import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ArrowUpRight, Check, Coins } from 'lucide-react';

import { useSession } from '@/core/auth/client';
import { useRouter } from '@/core/i18n/navigation';
import { VIDEO_DURATIONS, videoCreditCost } from '@/config/magi-video';
import { firstVideoPack, videoPlans } from '@/config/pricing';
import { apiPost } from '@/lib/api-client';
import { m } from '@/paraglide/messages.js';
import { usePublicConfig } from '@/hooks/use-public-config';
import { useVideoPurchase } from '@/hooks/use-video-purchase';

import { MagiLink } from './magi-site';

const creditNumber = new Intl.NumberFormat('en-US');
const billingOptions = ['oneTime', 'monthly'] as const;
type BillingOption = (typeof billingOptions)[number];
const yuan = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'CNY',
  currencyDisplay: 'narrowSymbol',
});

export function CreditEstimate({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? 'magi-section magi-estimate' : 'magi-estimate'}>
      <div>
        <span className="magi-panel-icon">
          <Coins size={19} />
        </span>
        <h2>{m['video.pricing.estimate']()}</h2>
        <p>
          {m['video.pricing.rule']()}
          {compact && ` ${m['video.pricing.default_format']()}`}
        </p>
      </div>
      {compact ? (
        <dl>
          {VIDEO_DURATIONS.map((duration) => (
            <div key={duration}>
              <dt>{m['video.studio.seconds']({ count: duration })}</dt>
              <dd>
                {m['video.studio.credit']({
                  count: creditNumber.format(videoCreditCost(duration)),
                })}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <div className="magi-rate-table">
          <table aria-label={m['video.pricing.estimate']()}>
            <thead>
              <tr>
                <th scope="col">{m['video.studio.duration']()}</th>
                <th scope="col">{m['video.pricing.credits_at_1080p']()}</th>
              </tr>
            </thead>
            <tbody>
              {[4, ...VIDEO_DURATIONS, 30].map((duration) => (
                <tr key={duration}>
                  <th scope="row">
                    {m['video.studio.seconds']({ count: duration })}
                  </th>
                  <td>{creditNumber.format(videoCreditCost(duration))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {compact && (
        <MagiLink href="/pricing">{m['video.nav.pricing']()}</MagiLink>
      )}
    </div>
  );
}

export function MagiPricing({
  embedded = false,
  initialBilling = 'oneTime',
}: {
  embedded?: boolean;
  initialBilling?: BillingOption;
}) {
  const [billing, setBilling] = useState(initialBilling);
  const monthly = billing === 'monthly';
  const { data: config, isError: configError } = usePublicConfig();
  const PlanTitle = embedded ? 'h3' : 'h2';
  const { data: session } = useSession();
  const purchase = useVideoPurchase(session?.user?.id);
  const router = useRouter();
  const stripeEnabled = config?.stripe_enabled === 'true';
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
      const returnTo = monthly ? '/pricing?billing=monthly' : '/pricing';
      router.push(`/sign-in?callbackUrl=${encodeURIComponent(returnTo)}`);
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
      <div className="magi-price-toolbar">
        <div
          className="magi-modes magi-price-toggle"
          role="group"
          aria-label={m['video.pricing.billing']()}
        >
          {billingOptions.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={billing === option}
              onClick={() => {
                checkout.reset();
                setBilling(option);
              }}
              disabled={checkout.isPending}
            >
              {m[`video.pricing.billing.${option}`]()}
            </button>
          ))}
        </div>
        <p className="magi-note">
          {monthly
            ? m['video.pricing.monthly_details']()
            : m['video.pricing.once_details']()}
        </p>
      </div>
      {!monthly && purchase.data?.firstPurchaseEligible !== false && (
        <article className="magi-price-card mb-3">
          <PlanTitle>{m['video.pricing.first_pack']()}</PlanTitle>
          <div className="magi-plan-price">
            <strong>{yuan.format(firstVideoPack.priceInCents / 100)}</strong>
            <span>{m['video.pricing.once']()}</span>
          </div>
          <div className="magi-plan-allowance">
            <p>
              <Check size={16} aria-hidden="true" />{' '}
              {m['video.studio.credit']({
                count: creditNumber.format(firstVideoPack.credits),
              })}
            </p>
            <p>{m['video.pricing.first_pack_allowance']()}</p>
            <p>{m['video.pricing.first_pack_terms']()}</p>
          </div>
          <button
            className="magi-button magi-button-primary"
            type="button"
            disabled={!stripeEnabled || checkout.isPending}
            onClick={() => buy(firstVideoPack.productId)}
          >
            {m['video.pricing.first_pack_buy']()} <ArrowUpRight size={15} />
          </button>
        </article>
      )}
      <div className="magi-price-grid" aria-live="polite">
        {videoPlans[billing].map((plan) => (
          <article className="magi-price-card" key={plan.productId}>
            <PlanTitle>{m[`video.pricing.pack.${plan.tier}`]()}</PlanTitle>
            <div className="magi-plan-price">
              <strong>{yuan.format(plan.priceInCents / 100)}</strong>
              <span>
                {monthly
                  ? m['video.pricing.month']()
                  : m['video.pricing.once']()}
              </span>
            </div>
            <div className="magi-plan-allowance">
              <p>
                <Check size={16} aria-hidden="true" />{' '}
                {m[
                  monthly
                    ? 'video.pricing.monthly_credits'
                    : 'video.studio.credit'
                ]({ count: creditNumber.format(plan.credits) })}
              </p>
              <p>
                {m['video.pricing.clip_count']({
                  count: Math.floor(plan.credits / videoCreditCost(5)),
                })}
              </p>
            </div>
            <button
              className="magi-button magi-button-primary"
              disabled={!stripeEnabled || checkout.isPending}
              type="button"
              onClick={() => buy(plan.productId)}
            >
              {monthly
                ? m['video.pricing.subscribe']()
                : m['video.pricing.buy']()}{' '}
              <ArrowUpRight size={15} />
            </button>
          </article>
        ))}
      </div>
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
      <CreditEstimate />
    </section>
  );
}
