import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ArrowUpRight, Check, Coins } from 'lucide-react';

import { useSession } from '@/core/auth/client';
import { useRouter } from '@/core/i18n/navigation';
import {
  DEFAULT_VIDEO_RESOLUTION,
  VIDEO_DURATIONS,
  VIDEO_RESOLUTIONS,
  videoCreditCost,
} from '@/config/magi-video';
import { videoPlans } from '@/config/pricing';
import { apiPost } from '@/lib/api-client';
import { m } from '@/paraglide/messages.js';
import { usePublicConfig } from '@/hooks/use-public-config';

import { MagiLink } from './magi-site';

const providers = ['stripe', 'creem', 'paypal'] as const;
const creditNumber = new Intl.NumberFormat('en-US');
const billingOptions = ['oneTime', 'monthly'] as const;
type BillingOption = (typeof billingOptions)[number];
const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
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
                  count: creditNumber.format(
                    videoCreditCost(duration, DEFAULT_VIDEO_RESOLUTION)
                  ),
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
                <th scope="col">{m['video.studio.resolution']()}</th>
                {VIDEO_DURATIONS.map((duration) => (
                  <th key={duration} scope="col">
                    {m['video.studio.seconds']({ count: duration })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {VIDEO_RESOLUTIONS.map((resolution) => (
                <tr key={resolution}>
                  <th scope="row">{resolution}</th>
                  {VIDEO_DURATIONS.map((duration) => (
                    <td key={duration}>
                      {creditNumber.format(
                        videoCreditCost(duration, resolution)
                      )}
                    </td>
                  ))}
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
  const router = useRouter();
  const enabled = providers.filter(
    (provider) => config?.[`${provider}_enabled`] === 'true'
  );
  const provider =
    enabled.find((name) => name === config?.default_payment_provider) ??
    enabled[0];
  const checkout = useMutation({
    mutationFn: (id: string) =>
      apiPost<{ checkout_url?: string }>('/api/payment/checkout', {
        product_id: id,
        payment_provider: provider,
        redirect: '/settings/videos',
        locale: 'en',
      }),
    onSuccess: ({ checkout_url }) => {
      if (checkout_url && /^https?:\/\//.test(checkout_url))
        window.location.assign(checkout_url);
    },
  });

  function buy(id: string) {
    if (!provider) return;
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
      <div className="magi-price-grid" aria-live="polite">
        {videoPlans[billing].map((plan) => (
          <article className="magi-price-card" key={plan.productId}>
            <PlanTitle>{m[`video.pricing.pack.${plan.tier}`]()}</PlanTitle>
            <div className="magi-plan-price">
              <strong>{usd.format(plan.priceInCents / 100)}</strong>
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
                  count: Math.floor(
                    plan.credits / videoCreditCost(5, DEFAULT_VIDEO_RESOLUTION)
                  ),
                })}
              </p>
            </div>
            <button
              className="magi-button magi-button-primary"
              disabled={!provider || checkout.isPending}
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
      {(config || configError) && !provider && (
        <p className="magi-note magi-library-note">
          {m['video.pricing.offline']()}
        </p>
      )}
      {(checkout.isError ||
        (checkout.isSuccess && !checkout.data.checkout_url)) && (
        <p role="alert" className="magi-error">
          {m['video.pricing.failed']()}
        </p>
      )}
      <CreditEstimate />
    </section>
  );
}
