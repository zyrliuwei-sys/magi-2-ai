import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { and, eq } from 'drizzle-orm';

// Isolated database; no application modules load before the env is set.
// Default: a temp SQLite file (the batch path). ATOMIC_D1=1 runs the same
// scenarios on Cloudflare's local D1 (workerd, via wrangler) — the real D1
// batch and error semantics. ATOMIC_PG_URL (a Postgres server URL) uses a
// throwaway database for the transaction path — run via `pnpm test:atomic:pg`,
// which maps the schema to schema.postgres.ts.
const directory = await mkdtemp(join(tmpdir(), 'shipany-atomic-test-'));
const pgServer = process.env.ATOMIC_PG_URL;
const useD1 = process.env.ATOMIC_D1 === '1';
const pgDatabase = `shipany_atomic_${process.pid}`;
const psql = (sql: string) =>
  execFileSync('psql', [pgServer!, '-Atc', sql], { stdio: 'pipe' });
if (pgServer) {
  psql(`create database ${pgDatabase}`);
  const url = new URL(pgServer);
  url.pathname = `/${pgDatabase}`;
  Object.assign(process.env, {
    DATABASE_PROVIDER: 'postgresql',
    DATABASE_URL: url.toString(),
  });
} else {
  Object.assign(process.env, {
    DATABASE_PROVIDER: 'sqlite',
    DATABASE_URL: `file:${directory}/test.db`,
  });
}
Object.assign(process.env, {
  AUTH_SECRET: 'isolated-atomic-test-secret-not-a-real-credential',
  NODE_ENV: 'test',
  VITE_APP_URL: 'http://localhost:3000',
});
execFileSync(
  process.execPath,
  [
    'node_modules/drizzle-kit/bin.cjs',
    'push',
    `--dialect=${pgServer ? 'postgresql' : 'sqlite'}`,
    `--schema=./src/config/db/schema.${pgServer ? 'postgres' : 'sqlite'}.ts`,
    `--url=${process.env.DATABASE_URL}`,
    '--force',
  ],
  { stdio: 'pipe', env: process.env }
);

let disposeD1: (() => Promise<void>) | undefined;
if (useD1) {
  // Copy the pushed SQLite schema into a throwaway local D1, then point the
  // app's D1 driver at it the way src/server.ts does on Workers.
  const { createClient } = await import('@libsql/client');
  const sqlite = createClient({ url: process.env.DATABASE_URL! });
  const ddl = (
    await sqlite.execute(
      "select sql from sqlite_master where sql is not null and name not like 'sqlite_%' and name not like '__drizzle%' order by type = 'index'"
    )
  ).rows.map((r) => String(r.sql));
  sqlite.close();
  const { getPlatformProxy } = await import('wrangler');
  const proxy = await getPlatformProxy<{ DB: any }>({
    configPath: 'wrangler.jsonc',
    persist: { path: join(directory, 'd1') },
    remoteBindings: false,
  });
  for (const statement of ddl) await proxy.env.DB.prepare(statement).run();
  (globalThis as any).__CF_ENV__ = proxy.env;
  process.env.DATABASE_PROVIDER = 'd1';
  disposeD1 = proxy.dispose;
}
const { db } = await import('../src/core/db');
const { atomic, AtomicGuardError, guard, setAtomicModeForTests } =
  await import('../src/core/db/atomic');
const schema = await import('@/config/db/schema');
const { settleCheckoutOrder, handleSubscriptionRenewal } =
  await import('../src/modules/payment/service');
const { consume, revoke, getBalance } =
  await import('../src/modules/credits/service');
const { AITaskStatus, createTask, updateTask } =
  await import('../src/modules/ai-tasks/service');
const { saveConfigs } = await import('../src/modules/config/service');
const { startVideoJob, readVideoJob } =
  await import('../src/server/video-jobs');
const { redeemInviteCode } =
  await import('../src/modules/invite-codes/service');

// Concurrency scenarios need the backend's real locking: SQLite runs the batch
// path (as D1 does), Postgres the transaction path.
const MODES = [pgServer ? 'transaction' : 'batch'] as const;
let seq = 0;
const id = (p: string) => `${p}-${++seq}`;

before(async () => {
  // One row per insert: D1 caps bound parameters at 100 per statement.
  for (let i = 0; i < 40; i++)
    await db()
      .insert(schema.user)
      .values({ id: `u${i}`, name: `U${i}`, email: `u${i}@example.test` });
});
after(async () => {
  setAtomicModeForTests(undefined);
  await disposeD1?.();
  await rm(directory, { recursive: true, force: true });
  if (pgServer) {
    await (
      await import('../src/core/db')
    ).closeDb({
      database_provider: 'postgresql',
      database_url: process.env.DATABASE_URL!,
    } as any);
    psql(`drop database if exists ${pgDatabase} with (force)`);
  }
});

async function grantCredits(userId: string, credits: number) {
  await db()
    .insert(schema.credit)
    .values({
      id: id('c'),
      userId,
      transactionNo: id('t'),
      transactionType: 'grant',
      transactionScene: 'gift',
      credits,
      remainingCredits: credits,
      status: 'active',
    });
}
async function createdOrder(userId: string, creditsAmount = 100) {
  const orderNo = id('ORD');
  await db().insert(schema.order).values({
    id: orderNo,
    orderNo,
    userId,
    status: 'created',
    amount: 500,
    currency: 'usd',
    paymentProvider: 'stripe',
    paymentSessionId: orderNo,
    checkoutInfo: '{}',
    paymentType: 'one-time',
    creditsAmount,
  });
  const [row] = await db()
    .select()
    .from(schema.order)
    .where(eq(schema.order.orderNo, orderNo));
  return row;
}
const paid = (orderNo: string) => ({
  paymentStatus: 'paid',
  paymentInfo: { amount: 500, transactionId: `T-${orderNo}` },
  paymentResult: { id: orderNo },
});
const grantsFor = (orderNo: string) =>
  db()
    .select()
    .from(schema.credit)
    .where(
      and(
        eq(schema.credit.orderNo, orderNo),
        eq(schema.credit.transactionType, 'grant')
      )
    );

let user = 0;
for (const mode of MODES) {
  test(`[${mode}] MAGI-2 submission retries charge once and concurrent failure polling restores once`, async (t) => {
    setAtomicModeForTests(mode);
    const u = `u${user++}`;
    const purchase = await createdOrder(u, 5000);
    const session = paid(purchase.orderNo);
    await settleCheckoutOrder(
      purchase,
      {
        ...session,
        paymentInfo: {
          ...session.paymentInfo,
          paymentAmount: 500,
          paymentCurrency: 'usd',
        },
      },
      'stripe'
    );
    await saveConfigs({ seeapi_api_key: 'fake-seeapi-test-key' });
    const realFetch = globalThis.fetch;
    let submissions = 0;
    const input = {
      id: crypto.randomUUID(),
      mode: 'text-to-video',
      prompt: 'A sparrow lands on a garden gate.',
      duration: 10,
      resolution: '1080p',
      ratio: '9:16',
      audio: false,
    } as const;

    t.mock.method(
      globalThis,
      'fetch',
      async (url: string, init?: RequestInit) => {
        if (!String(url).startsWith('https://api.seeapi.com/'))
          return realFetch(url, init);
        if (init?.method === 'POST') {
          submissions++;
          assert.equal(
            new Headers(init.headers).get('Idempotency-Key'),
            input.id
          );
          assert.deepEqual(JSON.parse(String(init.body)), {
            model: 'magi-2',
            endpoint: 'text-to-video',
            provider: 'seeapi',
            input: {
              prompt: input.prompt,
              aspect_ratio: input.ratio,
              duration_seconds: 10,
              resolution: '1080p',
              generate_audio: false,
            },
          });
          if (submissions === 1)
            throw new Error('Connection closed after request');
          return Response.json({
            generation: { id: 'task_magi', status: 'processing' },
          });
        }
        assert.equal(url, 'https://api.seeapi.com/v1/generations/task_magi');
        return Response.json({
          generation: { id: 'task_magi', status: 'refunded' },
        });
      }
    );

    const jobs = await Promise.all([
      startVideoJob(u, input),
      startVideoJob(u, input),
    ]);
    assert.equal(submissions, 1);
    assert.deepEqual(
      jobs.map((job) => job?.cost),
      [3000, 3000]
    );
    assert.equal(await getBalance(u), 2000);
    assert.equal(await readVideoJob('u39', input.id), undefined);

    await db()
      .update(schema.aiTask)
      .set({ updatedAt: new Date(Date.now() - 31_000) })
      .where(eq(schema.aiTask.id, input.id));
    await Promise.all([readVideoJob(u, input.id), readVideoJob(u, input.id)]);
    assert.equal(submissions, 2);
    const terminal = await Promise.all([
      readVideoJob(u, input.id),
      readVideoJob(u, input.id),
    ]);
    assert.deepEqual(
      terminal.map((job) => job?.status),
      ['failed', 'failed']
    );
    assert.equal(await getBalance(u), 5000);
  });

  test(`[${mode}] a failing statement rolls back every earlier one`, async () => {
    setAtomicModeForTests(mode);
    const u = `u${user++}`;
    const order = await createdOrder(u);
    const dupId = id('c');
    await grantCredits(u, 1);
    await db()
      .insert(schema.credit)
      .values({
        id: dupId,
        userId: u,
        transactionNo: id('t'),
        transactionType: 'grant',
        transactionScene: 'gift',
        credits: 1,
        remainingCredits: 1,
        status: 'active',
      });
    await assert.rejects(
      atomic((q) => [
        q
          .update(schema.order)
          .set({ status: 'paid' })
          .where(eq(schema.order.id, order.id)),
        q.insert(schema.credit).values({
          id: dupId,
          userId: u,
          transactionNo: id('t'),
          transactionType: 'grant',
          transactionScene: 'gift',
          credits: 1,
          remainingCredits: 1,
          status: 'active',
        }),
      ])
    );
    const [row] = await db()
      .select()
      .from(schema.order)
      .where(eq(schema.order.id, order.id));
    assert.equal(
      row.status,
      'created',
      'the update before the failure was rolled back'
    );
  });

  test(`[${mode}] a failing guard aborts with AtomicGuardError and writes nothing`, async () => {
    setAtomicModeForTests(mode);
    const u = `u${user++}`;
    const order = await createdOrder(u);
    await assert.rejects(
      atomic((q) => [
        q
          .update(schema.order)
          .set({ description: 'touched' })
          .where(eq(schema.order.id, order.id)),
        guard({
          table: schema.order,
          column: 'userId',
          where: eq(schema.order.id, order.id),
          require: eq(schema.order.status, 'paid'),
          message: 'not paid',
        }),
      ]),
      (e) => e instanceof AtomicGuardError && e.message === 'not paid'
    );
    const [row] = await db()
      .select()
      .from(schema.order)
      .where(eq(schema.order.id, order.id));
    assert.equal(row.description, null);
  });

  test(`[${mode}] concurrent settlements of one order grant exactly once`, async () => {
    setAtomicModeForTests(mode);
    const u = `u${user++}`;
    const order = await createdOrder(u);
    await Promise.all(
      Array.from({ length: 5 }, () =>
        settleCheckoutOrder(order, paid(order.orderNo), 'stripe')
      )
    );
    assert.equal((await grantsFor(order.orderNo)).length, 1);
    assert.equal(await getBalance(u), 100);
    const [row] = await db()
      .select()
      .from(schema.order)
      .where(eq(schema.order.id, order.id));
    assert.equal(row.status, 'paid');
  });

  test(`[${mode}] an order marked paid by other means is not granted again`, async () => {
    setAtomicModeForTests(mode);
    const u = `u${user++}`;
    const order = await createdOrder(u);
    await db()
      .update(schema.order)
      .set({ status: 'paid' })
      .where(eq(schema.order.id, order.id));
    await settleCheckoutOrder(order, paid(order.orderNo), 'stripe'); // stale read says "created"
    assert.equal((await grantsFor(order.orderNo)).length, 0);
  });

  test(`[${mode}] a paid order moved back to pending is never granted again`, async () => {
    setAtomicModeForTests(mode);
    const u = `u${user++}`;
    const order = await createdOrder(u);
    await settleCheckoutOrder(order, paid(order.orderNo), 'stripe');
    for (let i = 0; i < 2; i++) {
      // Whatever path resets the status (the reported exploit used the admin
      // order edit), a replayed notification must not grant again.
      await db()
        .update(schema.order)
        .set({ status: 'pending' })
        .where(eq(schema.order.id, order.id));
      const [stale] = await db()
        .select()
        .from(schema.order)
        .where(eq(schema.order.id, order.id));
      await settleCheckoutOrder(stale, paid(order.orderNo), 'stripe');
      await db()
        .update(schema.order)
        .set({ status: 'pending', paidAt: null })
        .where(eq(schema.order.id, order.id));
      const [wiped] = await db()
        .select()
        .from(schema.order)
        .where(eq(schema.order.id, order.id));
      await settleCheckoutOrder(wiped, paid(order.orderNo), 'stripe');
    }
    assert.equal((await grantsFor(order.orderNo)).length, 1);
    assert.equal(await getBalance(u), 100);
  });

  test(`[${mode}] concurrent consumes never overdraw and never half-charge`, async () => {
    setAtomicModeForTests(mode);
    const u = `u${user++}`;
    await grantCredits(u, 30);
    await grantCredits(u, 30);
    const results = await Promise.all(
      Array.from({ length: 10 }, () => consume({ userId: u, credits: 25 }))
    );
    const ok = results.filter((r) => r.success).length;
    assert.equal(ok, 2, '60 credits cover two 25-credit charges');
    assert.equal(await getBalance(u), 60 - ok * 25);
    const records = await db()
      .select()
      .from(schema.credit)
      .where(
        and(
          eq(schema.credit.userId, u),
          eq(schema.credit.transactionType, 'consume')
        )
      );
    assert.equal(
      records.length,
      ok,
      'one record per successful charge, none for failures'
    );
  });

  test(`[${mode}] one charge can span more grants than D1's 100-parameter limit`, async () => {
    setAtomicModeForTests(mode);
    const u = `u${user++}`;
    for (let i = 0; i < 150; i++) await grantCredits(u, 1);
    assert.equal((await consume({ userId: u, credits: 140 })).success, true);
    assert.equal(await getBalance(u), 10);
  });

  test(`[${mode}] revoking twice restores once`, async () => {
    setAtomicModeForTests(mode);
    const u = `u${user++}`;
    await grantCredits(u, 50);
    const { consumedCredit } = await consume({ userId: u, credits: 20 });
    await Promise.all([
      revoke(consumedCredit!.id!),
      revoke(consumedCredit!.id!),
      revoke(consumedCredit!.id!),
    ]);
    assert.equal(await getBalance(u), 50);
  });

  test(`[${mode}] a failed video returns its charge once and keeps its terminal status`, async () => {
    setAtomicModeForTests(mode);
    const u = `u${user++}`;
    await grantCredits(u, 20);
    const id = `video-${u}`;
    const input = {
      id,
      userId: u,
      mediaType: 'video',
      provider: 'higgsfield',
      model: 'sand/magi-2/text-to-video',
      prompt: 'A slow push-in',
      costCredits: 5,
    };
    await createTask(input);
    await assert.rejects(createTask(input));
    assert.equal(await getBalance(u), 15);
    await updateTask({
      taskId: id,
      status: AITaskStatus.PROCESSING,
      providerTaskId: 'sample-request',
    });
    await updateTask({
      taskId: id,
      status: AITaskStatus.FAILED,
      onlyIfUnsubmitted: true,
    });
    assert.equal(await getBalance(u), 15);
    await Promise.all(
      Array.from({ length: 3 }, () =>
        updateTask({ taskId: id, status: AITaskStatus.FAILED })
      )
    );
    assert.equal(await getBalance(u), 20);
    const final = await updateTask({
      taskId: id,
      status: AITaskStatus.SUCCESS,
    });
    assert.equal(final?.status, AITaskStatus.FAILED);
  });

  test(`[${mode}] an AI task without enough credits leaves no task behind`, async () => {
    setAtomicModeForTests(mode);
    const u = `u${user++}`;
    await grantCredits(u, 10);
    await assert.rejects(
      createTask({
        userId: u,
        mediaType: 'image',
        provider: 'x',
        model: 'm',
        prompt: 'p',
        costCredits: 11,
      }),
      /Insufficient/
    );
    const task = await createTask({
      userId: u,
      mediaType: 'image',
      provider: 'x',
      model: 'm',
      prompt: 'p',
      costCredits: 10,
    });
    assert.equal(task.userId, u);
    assert.ok(task.taskInfo && JSON.parse(task.taskInfo).creditId);
    assert.equal(await getBalance(u), 0);
    const tasks = await db()
      .select()
      .from(schema.aiTask)
      .where(eq(schema.aiTask.userId, u));
    assert.equal(tasks.length, 1);
  });

  test(`[${mode}] concurrent renewals of one period create one order`, async () => {
    setAtomicModeForTests(mode);
    const u = `u${user++}`;
    const subscriptionNo = id('SUB');
    const subscriptionId = id('sub_provider');
    await db()
      .insert(schema.subscription)
      .values({
        id: subscriptionNo,
        subscriptionNo,
        userId: u,
        status: 'active',
        paymentProvider: 'stripe',
        subscriptionId,
        amount: 500,
        currency: 'usd',
        creditsAmount: 40,
        currentPeriodStart: new Date('2026-01-01'),
        currentPeriodEnd: new Date('2026-02-01'),
      });
    const session = {
      subscriptionId,
      paymentStatus: 'paid',
      subscriptionInfo: {
        currentPeriodStart: new Date('2026-02-01'),
        currentPeriodEnd: new Date('2026-03-01'),
      },
      paymentInfo: {},
      paymentResult: {},
    };
    await Promise.all(
      Array.from({ length: 4 }, () =>
        handleSubscriptionRenewal(session, 'stripe')
      )
    );
    const renewals = await db()
      .select()
      .from(schema.order)
      .where(
        and(
          eq(schema.order.subscriptionNo, subscriptionNo),
          eq(schema.order.paymentType, 'renew')
        )
      );
    assert.equal(renewals.length, 1);
    assert.equal(await getBalance(u), 40);
  });

  test(`[${mode}] an invite code can't be redeemed past maxUses`, async () => {
    setAtomicModeForTests(mode);
    const code = id('CODE');
    await db()
      .insert(schema.inviteCode)
      .values({ id: code, code, maxUses: 2, usedCount: 0, trialDays: 7 });
    const users = Array.from({ length: 5 }, () => `u${user++}`);
    const results = await Promise.all(
      users.map((userId) => redeemInviteCode({ userId, code }))
    );
    assert.equal(results.filter((r) => r.ok).length, 2);
    const [row] = await db()
      .select()
      .from(schema.inviteCode)
      .where(eq(schema.inviteCode.id, code));
    assert.equal(row.usedCount, 2);
  });
}
