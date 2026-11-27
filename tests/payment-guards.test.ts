import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { eq } from 'drizzle-orm';

// Isolated SQLite DB; no application modules load before the env is set.
const directory = await mkdtemp(join(tmpdir(), 'shipany-guards-test-'));
Object.assign(process.env, {
  DATABASE_PROVIDER: 'sqlite',
  DATABASE_URL: `file:${directory}/test.db`,
  AUTH_SECRET: 'isolated-guards-test-secret-not-a-real-credential',
  STRIPE_SECRET_KEY: 'unit-test-placeholder',
  NODE_ENV: 'test',
  VITE_APP_URL: 'http://localhost:3000',
});
execFileSync(
  process.execPath,
  [
    'node_modules/drizzle-kit/bin.cjs',
    'push',
    '--dialect=sqlite',
    '--schema=./src/config/db/schema.sqlite.ts',
    `--url=${process.env.DATABASE_URL}`,
    '--force',
  ],
  { stdio: 'pipe', env: process.env }
);
const { db } = await import('../src/core/db');
const schema = await import('../src/config/db/schema');
const {
  createFirstVideoCheckout,
  FirstVideoPackUnavailableError,
  getVideoPurchaseStatus,
  settleCheckoutOrder,
} = await import('../src/modules/payment/service');
const { StripeProvider } = await import('../src/core/payment/stripe');
const { PaymentStatus } = await import('../src/core/payment/types');
const { startVideoJob, VideoPurchaseRequiredError } =
  await import('../src/server/video-jobs');
const { assertEndpointSecretsResupplied } =
  await import('../src/modules/config/service');
const { enforceMinIntervalRateLimit } = await import('../src/lib/rate-limit');
const { PATCH: patchOrder } =
  await import('../src/server/admin/handlers/orders');
const { isValidEmbedSetting } = await import('../src/lib/embed-ids');
const { firstVideoPack, getPricingProduct, listPricingProducts } =
  await import('../src/config/pricing');

before(async () => {
  await db()
    .insert(schema.user)
    .values({ id: 'u1', name: 'A', email: 'a@example.test' });
});
after(async () => {
  await rm(directory, { recursive: true, force: true });
});

async function createdOrder(orderNo: string, provider: string, amount: number) {
  await db().insert(schema.order).values({
    id: orderNo,
    orderNo,
    userId: 'u1',
    status: 'created',
    amount,
    currency: 'cny',
    paymentProvider: provider,
    paymentSessionId: orderNo,
    checkoutInfo: '{}',
    paymentType: 'one-time',
    creditsAmount: 100,
  });
  const [row] = await db()
    .select()
    .from(schema.order)
    .where(eq(schema.order.orderNo, orderNo));
  return row;
}
const success = (orderNo: string, amount: number) => ({
  paymentStatus: 'paid',
  paymentInfo: { amount, transactionId: `T-${orderNo}` },
  paymentResult: { out_trade_no: orderNo },
});

test('only three one-time USD video packs are purchasable', () => {
  const products = listPricingProducts().filter(
    (product) =>
      product.productId.startsWith('video_') &&
      product.checkoutEnabled !== false
  );
  assert.deepEqual(
    products.map(({ priceInCents, credits }) => [priceInCents, credits]),
    [
      [990, 3000],
      [3990, 9000],
      [5990, 15000],
    ]
  );
  for (const product of products) {
    assert.equal(product.currency, 'usd');
    assert.equal(product.type, 'one-time');
    assert.equal(product.plan, undefined);
    assert.equal(product.creditsValidDays, undefined);
  }
  assert.equal(
    getPricingProduct('enterprise_lifetime')?.checkoutEnabled,
    false
  );
  assert.equal(getPricingProduct('__proto__'), null);
  assert.equal(
    getPricingProduct('video_starter_monthly')?.checkoutEnabled,
    false
  );
  assert.equal(
    getPricingProduct('video_first_purchase')?.checkoutEnabled,
    false
  );
});

test('video generation requires a confirmed, nonzero credit purchase', async () => {
  const userId = 'video-access';
  await db()
    .insert(schema.user)
    .values({ id: userId, name: 'Video user', email: 'access@example.test' });
  await db().insert(schema.credit).values({
    id: 'video-bonus',
    userId,
    transactionNo: 'video-bonus',
    transactionType: 'grant',
    credits: 12450,
    remainingCredits: 12450,
    status: 'active',
  });
  await db().insert(schema.order).values({
    id: 'unpaid-access-order',
    orderNo: 'unpaid-access-order',
    userId,
    status: 'created',
    amount: 1500,
    currency: 'usd',
    checkoutInfo: '{}',
    paymentProvider: 'stripe',
    creditsAmount: 10550,
  });
  const input = {
    id: crypto.randomUUID(),
    prompt: 'A camera moves past a sculpture',
    mode: 'text-to-video',
    duration: 10,
    resolution: '1080p',
    ratio: '16:9',
    audio: true,
  } as const;
  await assert.rejects(
    startVideoJob(userId, input),
    VideoPurchaseRequiredError
  );
  assert.deepEqual(await getVideoPurchaseStatus(userId), {
    canGenerate: false,
    firstPurchaseEligible: true,
  });
  await db()
    .update(schema.order)
    .set({ status: 'paid', paymentAmount: 0 })
    .where(eq(schema.order.id, 'unpaid-access-order'));
  await assert.rejects(
    startVideoJob(userId, input),
    VideoPurchaseRequiredError
  );
  await db()
    .update(schema.order)
    .set({ paymentAmount: 1500 })
    .where(eq(schema.order.id, 'unpaid-access-order'));
  assert.deepEqual(await getVideoPurchaseStatus(userId), {
    canGenerate: true,
    firstPurchaseEligible: false,
  });
  await db()
    .update(schema.order)
    .set({ status: 'refunded' })
    .where(eq(schema.order.id, 'unpaid-access-order'));
  assert.deepEqual(await getVideoPurchaseStatus(userId), {
    canGenerate: false,
    firstPurchaseEligible: false,
  });
  await assert.rejects(
    startVideoJob(userId, input),
    VideoPurchaseRequiredError
  );
});

test('first pack checkout resumes one session, retries expiry and grants credits once', async (t) => {
  const userId = 'new-buyer';
  const appUrl = 'https://video.example.test';
  const userEmail = 'new-buyer@example.test';
  await db().insert(schema.user).values({
    id: userId,
    name: 'New Buyer',
    email: userEmail,
  });
  const keys = new Set<string>();
  let expired = false;
  t.mock.method(
    StripeProvider.prototype,
    'createPayment',
    async (
      params: Parameters<
        InstanceType<typeof StripeProvider>['createPayment']
      >[0]
    ) => {
      assert.deepEqual(params.order.price, { currency: 'usd', amount: 990 });
      assert.ok(params.order.successUrl && params.reservation);
      const callback = new URL(params.order.successUrl);
      assert.equal(callback.origin, appUrl);
      assert.ok(callback.searchParams.get('order_no'));
      const key = params.reservation.key;
      assert.ok(params.reservation.expiresAt > Date.now() / 1000);
      keys.add(key);
      return {
        provider: 'stripe',
        checkoutInfo: {
          sessionId: key,
          checkoutUrl: `https://checkout.stripe.com/${key}`,
        },
        checkoutResult: {},
      };
    }
  );
  t.mock.method(StripeProvider.prototype, 'getPaymentSession', async () => ({
    paymentStatus: expired ? PaymentStatus.CANCELED : PaymentStatus.PROCESSING,
    paymentResult: { status: expired ? 'expired' : 'open' },
  }));
  const request = { userId, userEmail, appUrl };
  await db().insert(schema.order).values({
    id: 'old-first-pack',
    orderNo: 'old-first-pack',
    userId,
    status: 'created',
    amount: 990,
    currency: 'cny',
    productId: 'video_first_purchase',
    creditsAmount: 1500,
    paymentProvider: 'stripe',
    paymentSessionId: 'old-session',
    checkoutInfo: '{}',
    checkoutUrl: 'https://checkout.stripe.com/old-session',
  });
  const expireOld = t.mock.method(
    StripeProvider.prototype,
    'expireCheckoutSession',
    async (id: string) => {
      assert.equal(id, 'old-session');
      return { paymentStatus: PaymentStatus.CANCELED };
    }
  );
  const current = await createFirstVideoCheckout(request);
  assert.equal(expireOld.mock.callCount(), 1);
  const [one, two] = await Promise.all([
    createFirstVideoCheckout(request),
    createFirstVideoCheckout(request),
  ]);
  assert.equal(one, two);
  assert.equal(one, current);
  assert.equal(await createFirstVideoCheckout(request), one);
  assert.equal(keys.size, 1);
  assert.equal((await getVideoPurchaseStatus(userId)).canGenerate, false);
  expired = true;
  const replacement = await createFirstVideoCheckout(request);
  assert.notEqual(one, replacement);
  assert.equal(keys.size, 2);
  const [reserved] = await db()
    .select()
    .from(schema.order)
    .where(eq(schema.order.checkoutUrl, replacement));
  assert.equal(reserved.productId, firstVideoPack.productId);
  assert.equal(reserved.creditsAmount, 3000);
  assert.equal(reserved.currency, 'usd');
  assert.equal(reserved.status, 'created');
  const manualClose = await patchOrder({
    request: new Request('http://localhost/api/admin/orders', {
      method: 'PATCH',
      body: JSON.stringify({ orderNo: reserved.orderNo, status: 'failed' }),
    }),
    actor: {},
  } as any);
  assert.notEqual((await manualClose.json()).code, 0);
  const paid = (amount: number, currency = 'usd') => ({
    paymentStatus: PaymentStatus.SUCCESS,
    paymentInfo: { paymentAmount: amount, paymentCurrency: currency },
    paymentResult: { id: reserved.paymentSessionId },
  });
  await assert.rejects(
    settleCheckoutOrder(reserved, paid(10), 'stripe'),
    /does not match/
  );
  await assert.rejects(
    settleCheckoutOrder(reserved, paid(990, 'cny'), 'stripe'),
    /does not match/
  );
  await settleCheckoutOrder(reserved, paid(990), 'stripe');
  await settleCheckoutOrder(reserved, paid(990), 'stripe');
  assert.deepEqual(await getVideoPurchaseStatus(userId), {
    canGenerate: true,
    firstPurchaseEligible: false,
  });
  const grants = await db()
    .select({ credits: schema.credit.credits })
    .from(schema.credit)
    .where(eq(schema.credit.userId, userId));
  assert.deepEqual(grants, [{ credits: 3000 }]);
  await assert.rejects(
    createFirstVideoCheckout(request),
    FirstVideoPackUnavailableError
  );
});

test('a CNY notification whose amount differs from the order is refused and grants nothing', async () => {
  const order = await createdOrder('ORD-MISMATCH', 'alipay', 9900);
  await assert.rejects(
    settleCheckoutOrder(order, success('ORD-MISMATCH', 1), 'alipay'),
    /does not match/
  );
  const [row] = await db()
    .select()
    .from(schema.order)
    .where(eq(schema.order.orderNo, 'ORD-MISMATCH'));
  assert.equal(row.status, 'created');
  const credits = await db()
    .select()
    .from(schema.credit)
    .where(eq(schema.credit.userId, 'u1'));
  assert.equal(credits.length, 0);
});

test('a matching CNY notification settles the order', async () => {
  const order = await createdOrder('ORD-MATCH', 'wechat', 9900);
  await settleCheckoutOrder(order, success('ORD-MATCH', 9900), 'wechat');
  const [row] = await db()
    .select()
    .from(schema.order)
    .where(eq(schema.order.orderNo, 'ORD-MATCH'));
  assert.equal(row.status, 'paid');
});

test('re-pointing an endpoint requires re-entering its saved secret', () => {
  const saved = {
    openai_base_url: 'https://api.openai.com/v1',
    openai_api_key: 'sk-saved',
  };
  assert.throws(
    () =>
      assertEndpointSecretsResupplied(
        { openai_base_url: 'https://evil.example' },
        saved
      ),
    /re-entering openai_api_key/
  );
  assert.throws(
    () =>
      assertEndpointSecretsResupplied(
        {
          openai_base_url: 'https://evil.example',
          openai_api_key: '••••••••aved',
        },
        saved
      ),
    /re-entering/
  );
  assert.doesNotThrow(() =>
    assertEndpointSecretsResupplied(
      { openai_base_url: 'https://evil.example', openai_api_key: 'sk-new' },
      saved
    )
  );
  assert.doesNotThrow(
    () =>
      assertEndpointSecretsResupplied(
        { openai_base_url: 'https://api.openai.com/v1/' },
        saved
      ),
    'unchanged (trailing slash) is fine'
  );
  assert.doesNotThrow(
    () =>
      assertEndpointSecretsResupplied(
        { openai_base_url: 'https://other.example' },
        { openai_base_url: '' }
      ),
    'no saved secret to leak'
  );
  assert.throws(
    () =>
      assertEndpointSecretsResupplied(
        { telegram_api_base: 'https://evil.example' },
        { telegram_bot_token: '123:abc' }
      ),
    /telegram_bot_token/
  );
  assert.throws(
    () =>
      assertEndpointSecretsResupplied(
        { notify_webhook_url: 'https://evil.example/hook' },
        {
          notify_webhook_url: 'https://ok.example/hook',
          notify_webhook_token: 't',
        }
      ),
    /notify_webhook_token/
  );
});

test('rate limiting ignores cookies and keys authenticated callers by user', () => {
  const req = (cookie: string, ip = '203.0.113.9') =>
    new Request('http://localhost/api/x', {
      method: 'POST',
      headers: { cookie, 'x-forwarded-for': ip },
    });
  assert.equal(
    enforceMinIntervalRateLimit(req('a=1'), {
      intervalMs: 60_000,
      keyPrefix: 't1',
    }),
    null
  );
  assert.equal(
    enforceMinIntervalRateLimit(req('a=2'), {
      intervalMs: 60_000,
      keyPrefix: 't1',
    })?.status,
    429,
    'a new cookie is not a new bucket'
  );
  assert.equal(
    enforceMinIntervalRateLimit(req('', '198.51.100.1'), {
      intervalMs: 60_000,
      keyPrefix: 't2',
      extraKey: 'u1',
    }),
    null
  );
  assert.equal(
    enforceMinIntervalRateLimit(req('', '198.51.100.2'), {
      intervalMs: 60_000,
      keyPrefix: 't2',
      extraKey: 'u1',
    })?.status,
    429,
    'a new IP is not a new bucket for the same user'
  );
});

test('the admin order edit can only close unpaid orders', async () => {
  const edit = async (orderNo: string, status: string) => {
    const res = await patchOrder({
      request: new Request('http://localhost/api/admin/orders', {
        method: 'PATCH',
        body: JSON.stringify({ orderNo, status, description: 'note' }),
      }),
      actor: {},
    } as any);
    return (await res.json()).code;
  };
  const paidOrder = await createdOrder('ORD-EDIT-PAID', 'stripe', 500);
  await db()
    .update(schema.order)
    .set({ status: 'paid' })
    .where(eq(schema.order.id, paidOrder.id));
  assert.notEqual(
    await edit('ORD-EDIT-PAID', 'pending'),
    0,
    'paid → pending refused'
  );
  assert.notEqual(
    await edit('ORD-EDIT-PAID', 'refunded'),
    0,
    'paid → refunded refused'
  );
  assert.equal(
    await edit('ORD-EDIT-PAID', 'paid'),
    0,
    'unchanged status with other edits is fine'
  );
  await createdOrder('ORD-EDIT-OPEN', 'stripe', 500);
  assert.notEqual(
    await edit('ORD-EDIT-OPEN', 'paid'),
    0,
    'created → paid refused'
  );
  assert.equal(
    await edit('ORD-EDIT-OPEN', 'failed'),
    0,
    'created → failed allowed'
  );
  const [row] = await db()
    .select()
    .from(schema.order)
    .where(eq(schema.order.orderNo, 'ORD-EDIT-PAID'));
  assert.equal(row.status, 'paid');
});

test('the Plausible script must come from plausible.io or a deployment-listed host', () => {
  assert.equal(
    isValidEmbedSetting(
      'plausible_src',
      'https://stats.cadcraft.org/js/pa-site.js'
    ),
    true
  );
  for (const value of [
    'https://stats.cadcraft.org.evil.example/js/script.js',
    'https://evil.stats.cadcraft.org/js/script.js',
    'http://stats.cadcraft.org/js/script.js',
    'https://user:password@stats.cadcraft.org/js/script.js',
  ]) {
    assert.equal(isValidEmbedSetting('plausible_src', value), false, value);
  }
  assert.equal(
    isValidEmbedSetting('plausible_src', 'https://plausible.io/js/pa-abc.js'),
    true
  );
  assert.equal(
    isValidEmbedSetting('plausible_src', 'https://evil.example/x.js'),
    false
  );
  assert.equal(
    isValidEmbedSetting(
      'plausible_src',
      'https://plausible.io.evil.example/x.js'
    ),
    false
  );
  assert.equal(
    isValidEmbedSetting('plausible_src', 'http://plausible.io/js/script.js'),
    false
  );
  assert.equal(isValidEmbedSetting('plausible_src', '/js/script.js'), true);
  for (const src of [
    '//evil.example/x.js',
    '/\\evil.example/x.js',
    '/\\/evil.example/x.js',
  ])
    assert.equal(isValidEmbedSetting('plausible_src', src), false, src);
  // Runtime server env, and the older build-time name, both count.
  for (const name of [
    'PLAUSIBLE_SCRIPT_HOSTS',
    'VITE_PLAUSIBLE_SCRIPT_HOSTS',
  ]) {
    process.env[name] = 'other.example, Stats.Example.com';
    assert.equal(
      isValidEmbedSetting(
        'plausible_src',
        'https://stats.example.com/js/script.js'
      ),
      true,
      name
    );
    delete process.env[name];
  }
  assert.equal(
    isValidEmbedSetting(
      'plausible_src',
      'https://stats.example.com/js/script.js'
    ),
    false
  );
  (globalThis as any).__CF_ENV__ = {
    PLAUSIBLE_SCRIPT_HOSTS: 'stats.example.com',
  };
  assert.equal(
    isValidEmbedSetting(
      'plausible_src',
      'https://stats.example.com/js/script.js'
    ),
    true
  );
  delete (globalThis as any).__CF_ENV__;
});
