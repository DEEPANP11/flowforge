// Worker Entry Point
// Background job processor for workflow execution

import { getNextJob, completeJob, failJob, pushJob } from './queue';
import { executeWorkflow } from './workflowExecutor';

const POLL_INTERVAL_MS = 1000; // 1 second
const MAX_CONCURRENT_JOBS = 5;

let isRunning = false;
let activeJobs = 0;

/**
 * Start the worker
 */
export async function startWorker(): Promise<void> {
  console.log('[Worker] Starting background worker...');
  isRunning = true;

  while (isRunning) {
    try {
      // Check if we can process more jobs
      if (activeJobs < MAX_CONCURRENT_JOBS) {
        // Get next job
        const job = await getNextJob();

        if (job) {
          console.log(`[Worker] Processing job: ${job.id} (${job.job_type})`);
          activeJobs++;

          // Process job asynchronously
          processJob(job).finally(() => {
            activeJobs--;
          });
        }
      }

      // Wait before polling again
      await sleep(POLL_INTERVAL_MS);
    } catch (error) {
      console.error('[Worker] Error in worker loop:', error);
      await sleep(POLL_INTERVAL_MS * 5); // Wait longer on error
    }
  }

  console.log('[Worker] Worker stopped');
}

/**
 * Stop the worker
 */
export function stopWorker(): void {
  console.log('[Worker] Stopping worker...');
  isRunning = false;
}

/**
 * Process a single job
 */
async function processJob(job: {
  id: string;
  job_type: string;
  payload: any;
}): Promise<void> {
  try {
    switch (job.job_type) {
      case 'executeWorkflow':
        await executeWorkflow(job.payload.workflowRunId);
        break;

      case 'resumeWorkflow':
        await executeWorkflow(job.payload.workflowRunId);
        break;

      case 'cleanupOldJobs':
        // Handled by scheduled function
        break;

      default:
        console.warn(`[Worker] Unknown job type: ${job.job_type}`);
    }

    // Mark job as completed
    await completeJob(job.id);
    console.log(`[Worker] Job completed: ${job.id}`);
  } catch (error) {
    console.error(`[Worker] Job failed: ${job.id}`, error);

    // Mark job as failed (with retry logic)
    await failJob(job.id, error.message, true);
  }
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Start worker if this file is run directly
if (require.main === module) {
  startWorker().catch(console.error);
}
