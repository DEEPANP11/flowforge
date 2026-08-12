// Queue Service
// PostgreSQL-based job queue for background execution

import { graphqlRequest } from '../../../utils/nhost';

export interface Job {
  id: string;
  job_type: string;
  payload: any;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  priority: number;
  max_retries: number;
  retry_count: number;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  error_message?: string;
  next_retry_at?: string;
}

/**
 * Add a job to the queue
 */
export async function pushJob(
  jobType: string,
  payload: any,
  priority: number = 0
): Promise<string> {
  const mutation = `
    mutation PushJob($object: job_queue_insert_input!) {
      insert_job_queue_one(object: $object) {
        id
      }
    }
  `;

  const { data, error } = await graphqlRequest(mutation, {
    object: {
      job_type: jobType,
      payload,
      status: 'pending',
      priority,
      max_retries: 3,
      retry_count: 0,
    },
  });

  if (error) {
    throw new Error(`Failed to push job: ${error.message}`);
  }

  return data.insert_job_queue_one.id;
}

/**
 * Get the next pending job (with locking)
 */
export async function getNextJob(): Promise<Job | null> {
  const query = `
    query GetNextJob {
      job_queue(
        where: { 
          status: { _eq: "pending" },
          _or: [
            { next_retry_at: { _is_null: true } },
            { next_retry_at: { _lte: now() } }
          ]
        }
        order_by: [{ priority: desc }, { created_at: asc }]
        limit: 1
      ) {
        id
        job_type
        payload
        status
        priority
        max_retries
        retry_count
        created_at
        started_at
        completed_at
        error_message
        next_retry_at
      }
    }
  `;

  const { data, error } = await graphqlRequest(query);

  if (error || !data?.job_queue?.length) {
    return null;
  }

  const job = data.job_queue[0];

  // Try to claim the job
  const claimed = await claimJob(job.id);
  if (!claimed) {
    return null;
  }

  return job;
}

/**
 * Claim a job (mark as processing)
 */
async function claimJob(jobId: string): Promise<boolean> {
  const mutation = `
    mutation ClaimJob($id: uuid!) {
      update_job_queue_by_pk(
        pk_columns: { id: $id }
        _set: { 
          status: "processing",
          started_at: now()
        }
      ) {
        id
        status
      }
    }
  `;

  const { data, error } = await graphqlRequest(mutation, { id: jobId });
  return !error && !!data?.update_job_queue_by_pk;
}

/**
 * Complete a job
 */
export async function completeJob(jobId: string): Promise<void> {
  const mutation = `
    mutation CompleteJob($id: uuid!) {
      update_job_queue_by_pk(
        pk_columns: { id: $id }
        _set: { 
          status: "completed",
          completed_at: now()
        }
      ) {
        id
      }
    }
  `;

  await graphqlRequest(mutation, { id: jobId });
}

/**
 * Fail a job (with optional retry)
 */
export async function failJob(
  jobId: string,
  errorMessage: string,
  shouldRetry: boolean = true
): Promise<void> {
  // Get current job state
  const query = `
    query GetJob($id: uuid!) {
      job_queue_by_pk(id: $id) {
        id
        retry_count
        max_retries
      }
    }
  `;

  const { data } = await graphqlRequest(query, { id: jobId });
  const job = data?.job_queue_by_pk;

  if (!job) {
    return;
  }

  const canRetry = shouldRetry && job.retry_count < job.max_retries;
  const newRetryCount = job.retry_count + 1;

  // Calculate next retry time with exponential backoff
  const nextRetryAt = canRetry
    ? new Date(Date.now() + Math.pow(2, newRetryCount) * 1000).toISOString()
    : null;

  const mutation = `
    mutation FailJob($id: uuid!, $errorMessage: String!, $status: String!, $retryCount: Int!, $nextRetryAt: timestamptz) {
      update_job_queue_by_pk(
        pk_columns: { id: $id }
        _set: { 
          status: $status,
          error_message: $errorMessage,
          retry_count: $retryCount,
          next_retry_at: $nextRetryAt
        }
      ) {
        id
      }
    }
  `;

  await graphqlRequest(mutation, {
    id: jobId,
    errorMessage,
    status: canRetry ? 'pending' : 'failed',
    retryCount: newRetryCount,
    nextRetryAt,
  });
}

/**
 * Get queue statistics
 */
export async function getQueueStats(): Promise<{
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}> {
  const query = `
    query GetQueueStats {
      pending: job_queue_aggregate(where: { status: { _eq: "pending" } }) {
        aggregate {
          count
        }
      }
      processing: job_queue_aggregate(where: { status: { _eq: "processing" } }) {
        aggregate {
          count
        }
      }
      completed: job_queue_aggregate(where: { status: { _eq: "completed" } }) {
        aggregate {
          count
        }
      }
      failed: job_queue_aggregate(where: { status: { _eq: "failed" } }) {
        aggregate {
          count
        }
      }
    }
  `;

  const { data } = await graphqlRequest(query);

  return {
    pending: data?.pending?.aggregate?.count || 0,
    processing: data?.processing?.aggregate?.count || 0,
    completed: data?.completed?.aggregate?.count || 0,
    failed: data?.failed?.aggregate?.count || 0,
  };
}

/**
 * Clean up old completed/failed jobs
 */
export async function cleanupOldJobs(olderThanDays: number = 7): Promise<number> {
  const mutation = `
    mutation CleanupOldJobs($cutoffDate: timestamptz!) {
      delete_job_queue(
        where: {
          _and: [
            { status: { _in: ["completed", "failed"] } },
            { created_at: { _lt: $cutoffDate } }
          ]
        }
      ) {
        affected_rows
      }
    }
  `;

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

  const { data } = await graphqlRequest(mutation, {
    cutoffDate: cutoffDate.toISOString(),
  });

  return data?.delete_job_queue?.affected_rows || 0;
}
