import { and, desc, eq, inArray, isNull } from 'drizzle-orm';

import { db } from '@/core/db';
import { atomic, AtomicGuardError, guard } from '@/core/db/atomic';
import { aiTask } from '@/config/db/schema';
import { planConsume, planRevoke } from '@/modules/credits/service';
import { getUuid } from '@/lib/hash';

export enum AITaskStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SUCCESS = 'success',
  FAILED = 'failed',
  CANCELED = 'canceled',
}

/**
 * Create an AI task with optional credit consumption.
 */
export async function createTask(params: {
  id?: string;
  userId: string;
  mediaType: string;
  provider: string;
  model: string;
  prompt: string;
  costCredits?: number;
  options?: unknown;
}): Promise<typeof aiTask.$inferSelect> {
  const { userId, mediaType, provider, model, prompt, costCredits, options } =
    params;

  for (let attempt = 0; attempt < 3; attempt++) {
    const taskData: typeof aiTask.$inferInsert = {
      id: params.id ?? getUuid(),
      userId,
      mediaType,
      provider,
      model,
      prompt,
      options: options === undefined ? undefined : JSON.stringify(options),
      status: AITaskStatus.PENDING,
      costCredits: costCredits || 0,
    };

    // Plan the credit charge first, then write the task and the charge in one
    // atomic step (D1-safe) — never a task without its charge or vice versa.
    const plan =
      costCredits && costCredits > 0
        ? await planConsume({
            userId,
            credits: costCredits,
            scene: 'ai_task',
            description: `AI ${mediaType} generation`,
            metadata: JSON.stringify({ taskId: taskData.id }),
          })
        : undefined;
    if (plan === null) throw new Error('Insufficient credits');
    if (plan) {
      // Stored for revocation if the task fails.
      taskData.creditId = plan.consumedCredit.id;
      taskData.taskInfo = JSON.stringify({
        creditId: plan.consumedCredit.id,
      });
    }

    try {
      await atomic((q) => [
        q.insert(aiTask).values(taskData),
        ...(plan ? plan.steps(q) : []),
      ]);
    } catch (error) {
      // A concurrent spend drained the grants we planned on: re-plan.
      if (error instanceof AtomicGuardError) continue;
      throw error;
    }

    const [task] = await db()
      .select()
      .from(aiTask)
      .where(eq(aiTask.id, taskData.id))
      .limit(1);
    return task;
  }
  throw new Error('Insufficient credits');
}

/** Move a live task forward and restore its charge in the same batch on failure. */
export async function updateTask(params: {
  taskId: string;
  status: AITaskStatus;
  providerTaskId?: string;
  onlyIfUnsubmitted?: boolean;
  taskResult?: unknown;
}) {
  const { taskId, status, providerTaskId, onlyIfUnsubmitted, taskResult } =
    params;
  const task = await findTask(taskId);
  if (!task) throw new Error('Task not found');
  const pending = task.status === AITaskStatus.PENDING;
  if (!pending && task.status !== AITaskStatus.PROCESSING) return task;

  const terminalFailure =
    status === AITaskStatus.FAILED || status === AITaskStatus.CANCELED;
  let creditId = task.creditId;
  if (terminalFailure && !creditId && task.taskInfo) {
    try {
      creditId = JSON.parse(task.taskInfo).creditId;
    } catch {
      // Older records can have provider metadata instead of a credit ID.
    }
  }
  const restore =
    terminalFailure && creditId ? await planRevoke(creditId) : undefined;
  const allowed =
    providerTaskId || onlyIfUnsubmitted
      ? and(eq(aiTask.status, AITaskStatus.PENDING), isNull(aiTask.taskId))!
      : inArray(aiTask.status, [AITaskStatus.PENDING, AITaskStatus.PROCESSING]);
  try {
    await atomic((q) => [
      guard({
        table: aiTask,
        column: 'userId',
        where: eq(aiTask.id, taskId),
        require: allowed,
        message: 'Task status changed',
      }),
      q
        .update(aiTask)
        .set({
          status,
          taskId: providerTaskId,
          taskResult:
            taskResult === undefined ? undefined : JSON.stringify(taskResult),
        })
        .where(eq(aiTask.id, taskId)),
      ...(restore ? restore(q) : []),
    ]);
  } catch (error) {
    if (!(error instanceof AtomicGuardError)) throw error;
  }
  return findTask(taskId);
}

/**
 * Get tasks for a user.
 */
export async function getTasks(params: {
  userId: string;
  mediaType?: string;
  provider?: string | string[];
  status?: string;
  page?: number;
  limit?: number;
}) {
  const { userId, mediaType, provider, status, page = 1, limit = 20 } = params;

  return db()
    .select()
    .from(aiTask)
    .where(
      and(
        eq(aiTask.userId, userId),
        mediaType ? eq(aiTask.mediaType, mediaType) : undefined,
        Array.isArray(provider)
          ? inArray(aiTask.provider, provider)
          : provider
            ? eq(aiTask.provider, provider)
            : undefined,
        status ? eq(aiTask.status, status) : undefined,
        isNull(aiTask.deletedAt)
      )
    )
    .orderBy(desc(aiTask.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);
}

/** Let one reader retry a pending upstream submission for this task version. */
export async function claimTaskSubmission(taskId: string, updatedAt: Date) {
  try {
    await atomic((q) => [
      guard({
        table: aiTask,
        column: 'userId',
        where: eq(aiTask.id, taskId),
        require: and(
          eq(aiTask.status, AITaskStatus.PENDING),
          isNull(aiTask.taskId),
          eq(aiTask.updatedAt, updatedAt)
        )!,
        message: 'Task submission already claimed',
      }),
      q
        .update(aiTask)
        .set({ updatedAt: new Date() })
        .where(eq(aiTask.id, taskId)),
    ]);
    return true;
  } catch (error) {
    if (error instanceof AtomicGuardError) return false;
    throw error;
  }
}

/**
 * Find task by ID.
 */
export async function findTask(taskId: string) {
  const [result] = (await db()
    .select()
    .from(aiTask)
    .where(eq(aiTask.id, taskId))
    .limit(1)) as (typeof aiTask.$inferSelect)[];
  return result;
}
