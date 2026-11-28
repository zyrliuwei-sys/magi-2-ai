/**
 * Authoritative pricing catalog.
 *
 * The checkout API uses this as the SOURCE OF TRUTH for price/credits/duration.
 * Any price, credits, or plan info sent by the client is IGNORED — only the
 * product_id is honored, and everything else is looked up here.
 *
 * To change pricing, edit this file and redeploy. Admin UI cannot alter prices.
 */

import { PaymentInterval, PaymentType } from '@/core/payment/types';
import { MAGI_VIDEO_CREDITS } from '@/config/magi-video';

export type PricingPlanInfo = {
  name: string;
  interval: PaymentInterval;
  intervalCount: number;
};

export type PricingProduct = {
  productId: string;
  productName: string;
  planName: string;
  description: string;
  type: PaymentType;
  priceInCents: number;
  currency: string;
  /**
   * Price in fen for CNY-only providers (Alipay, WeChat Pay) when `currency`
   * isn't CNY. Without it those providers refuse the product — the amount is
   * never reused across currencies.
   */
  cnyPriceInCents?: number;
  credits: number;
  creditsValidDays?: number;
  /** Preserve legacy product IDs for lookup while preventing new purchases. */
  checkoutEnabled?: false;
  plan?: PricingPlanInfo;
  /**
   * 'guest_post': a guest post package. Sold only through
   * /api/guest-posts/$id/checkout (tied to an approved submission); the
   * generic checkout refuses it.
   */
  kind?: 'guest_post';
  /** Guest post packages: most external links the article may contain. */
  maxLinks?: number;
};

const legacyFirstVideoPackProductId = 'video_first_purchase';

const videoPriceFormat = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatVideoPackPrice(priceInCents: number) {
  return videoPriceFormat.format(priceInCents / 100);
}

export const firstVideoPack = {
  productId: 'video_first_purchase_usd',
  tier: 'first',
  label: 'First Video Pack',
  priceInCents: 990,
  currency: 'usd',
  clips: 1,
  credits: MAGI_VIDEO_CREDITS,
} as const;

const regularVideoPacks = [
  {
    tier: 'three',
    productId: 'video_three_once_usd',
    label: '3-Video Pack',
    clips: 3,
    priceInCents: 3990,
  },
  {
    tier: 'five',
    productId: 'video_five_once_usd',
    label: '5-Video Pack',
    clips: 5,
    priceInCents: 5990,
  },
] as const;

export const videoPacks = [
  firstVideoPack,
  ...regularVideoPacks.map((pack) => ({
    ...pack,
    currency: 'usd' as const,
    credits: pack.clips * MAGI_VIDEO_CREDITS,
  })),
] as const;

export const firstVideoPackProductIds = [
  firstVideoPack.productId,
  legacyFirstVideoPackProductId,
] as const;

export function isFirstVideoPackProduct(productId: string | null | undefined) {
  return firstVideoPackProductIds.some((id) => id === productId);
}

export function isVideoPackProduct(productId: string | null) {
  return (
    productId === legacyFirstVideoPackProductId ||
    videoPacks.some((pack) => pack.productId === productId)
  );
}

const archivedVideoPlans = [
  [
    legacyFirstVideoPackProductId,
    firstVideoPack.label,
    990,
    1500,
    PaymentType.ONE_TIME,
    'cny',
  ],
  ['video_starter_once', 'Starter', 1500, 10550, PaymentType.ONE_TIME],
  ['video_creator_once', 'Creator', 3900, 28500, PaymentType.ONE_TIME],
  ['video_studio_once', 'Studio', 8900, 76000, PaymentType.ONE_TIME],
  ['video_starter_monthly', 'Starter', 1900, 15200, PaymentType.SUBSCRIPTION],
  ['video_creator_monthly', 'Creator', 4900, 45600, PaymentType.SUBSCRIPTION],
  ['video_studio_monthly', 'Studio', 11900, 121600, PaymentType.SUBSCRIPTION],
  [
    'video_starter_once_cny',
    'Starter',
    2990,
    6000,
    PaymentType.ONE_TIME,
    'cny',
  ],
  [
    'video_creator_once_cny',
    'Creator',
    6990,
    15000,
    PaymentType.ONE_TIME,
    'cny',
  ],
  [
    'video_studio_once_cny',
    'Studio',
    14990,
    36000,
    PaymentType.ONE_TIME,
    'cny',
  ],
  [
    'video_starter_monthly_cny',
    'Starter',
    4990,
    10500,
    PaymentType.SUBSCRIPTION,
    'cny',
  ],
  [
    'video_creator_monthly_cny',
    'Creator',
    10990,
    25500,
    PaymentType.SUBSCRIPTION,
    'cny',
  ],
  [
    'video_studio_monthly_cny',
    'Studio',
    22990,
    60000,
    PaymentType.SUBSCRIPTION,
    'cny',
  ],
] as const;

export const pricingCatalog: Record<string, PricingProduct> = {
  ...Object.fromEntries(
    videoPacks.map(({ productId, label, priceInCents, credits, currency }) => [
      productId,
      {
        productId,
        productName: label,
        planName: label,
        description: `${credits.toLocaleString('en-US')} video credits`,
        type: PaymentType.ONE_TIME,
        priceInCents,
        currency,
        credits,
      } satisfies PricingProduct,
    ])
  ),
  ...Object.fromEntries(
    archivedVideoPlans.map(
      ([productId, label, priceInCents, credits, type, currency = 'usd']) => [
        productId,
        {
          productId,
          productName: label,
          planName: label,
          description: `${credits} video credits`,
          priceInCents,
          credits,
          type,
          currency,
          checkoutEnabled: false,
        } satisfies PricingProduct,
      ]
    )
  ),
  // Retired template products. Existing orders and subscriptions retain their snapshots.
  starter_monthly: {
    checkoutEnabled: false,
    productId: 'starter_monthly',
    productName: 'Starter',
    planName: 'Starter',
    description: 'Starter Monthly',
    type: PaymentType.SUBSCRIPTION,
    priceInCents: 900,
    currency: 'usd',
    credits: 5000,
    plan: {
      name: 'Starter',
      interval: PaymentInterval.MONTH,
      intervalCount: 1,
    },
  },
  pro_monthly: {
    checkoutEnabled: false,
    productId: 'pro_monthly',
    productName: 'Pro',
    planName: 'Pro',
    description: 'Pro Monthly',
    type: PaymentType.SUBSCRIPTION,
    priceInCents: 2900,
    currency: 'usd',
    credits: 50000,
    plan: { name: 'Pro', interval: PaymentInterval.MONTH, intervalCount: 1 },
  },
  enterprise_monthly: {
    checkoutEnabled: false,
    productId: 'enterprise_monthly',
    productName: 'Enterprise',
    planName: 'Enterprise',
    description: 'Enterprise Monthly',
    type: PaymentType.SUBSCRIPTION,
    priceInCents: 9900,
    currency: 'usd',
    credits: 500000,
    plan: {
      name: 'Enterprise',
      interval: PaymentInterval.MONTH,
      intervalCount: 1,
    },
  },
  starter_yearly: {
    checkoutEnabled: false,
    productId: 'starter_yearly',
    productName: 'Starter',
    planName: 'Starter',
    description: 'Starter Yearly',
    type: PaymentType.SUBSCRIPTION,
    priceInCents: 8600,
    currency: 'usd',
    credits: 60000,
    plan: { name: 'Starter', interval: PaymentInterval.YEAR, intervalCount: 1 },
  },
  pro_yearly: {
    checkoutEnabled: false,
    productId: 'pro_yearly',
    productName: 'Pro',
    planName: 'Pro',
    description: 'Pro Yearly',
    type: PaymentType.SUBSCRIPTION,
    priceInCents: 27800,
    currency: 'usd',
    credits: 600000,
    plan: { name: 'Pro', interval: PaymentInterval.YEAR, intervalCount: 1 },
  },
  enterprise_yearly: {
    checkoutEnabled: false,
    productId: 'enterprise_yearly',
    productName: 'Enterprise',
    planName: 'Enterprise',
    description: 'Enterprise Yearly',
    type: PaymentType.SUBSCRIPTION,
    priceInCents: 95000,
    currency: 'usd',
    credits: 6000000,
    plan: {
      name: 'Enterprise',
      interval: PaymentInterval.YEAR,
      intervalCount: 1,
    },
  },
  starter_lifetime: {
    checkoutEnabled: false,
    productId: 'starter_lifetime',
    productName: 'Starter',
    planName: 'Starter Lifetime',
    description: 'Starter Lifetime',
    type: PaymentType.ONE_TIME,
    priceInCents: 14900,
    currency: 'usd',
    credits: 100000,
  },
  pro_lifetime: {
    checkoutEnabled: false,
    productId: 'pro_lifetime',
    productName: 'Pro',
    planName: 'Pro Lifetime',
    description: 'Pro Lifetime',
    type: PaymentType.ONE_TIME,
    priceInCents: 49900,
    currency: 'usd',
    credits: 1000000,
  },
  enterprise_lifetime: {
    checkoutEnabled: false,
    productId: 'enterprise_lifetime',
    productName: 'Enterprise',
    planName: 'Enterprise Lifetime',
    description: 'Enterprise Lifetime',
    type: PaymentType.ONE_TIME,
    priceInCents: 199900,
    currency: 'usd',
    credits: 10000000,
  },

  // Guest posts (see src/modules/guest-posts). Published permanently, every
  // external link rendered rel="sponsored nofollow".
  guest_post_standard: {
    productId: 'guest_post_standard',
    productName: 'Guest Post',
    planName: 'Standard',
    description: 'Guest post (1 link)',
    type: PaymentType.ONE_TIME,
    priceInCents: 9900,
    currency: 'usd',
    cnyPriceInCents: 69900,
    credits: 0,
    kind: 'guest_post',
    maxLinks: 1,
  },
  guest_post_premium: {
    productId: 'guest_post_premium',
    productName: 'Guest Post',
    planName: 'Premium',
    description: 'Guest post (3 links)',
    type: PaymentType.ONE_TIME,
    priceInCents: 19900,
    currency: 'usd',
    cnyPriceInCents: 139900,
    credits: 0,
    kind: 'guest_post',
    maxLinks: 3,
  },
};

export function getPricingProduct(productId: string): PricingProduct | null {
  return Object.hasOwn(pricingCatalog, productId)
    ? pricingCatalog[productId]
    : null;
}

export function listPricingProducts(): PricingProduct[] {
  return Object.values(pricingCatalog);
}

export function listGuestPostPackages(): PricingProduct[] {
  return listPricingProducts().filter((p) => p.kind === 'guest_post');
}
