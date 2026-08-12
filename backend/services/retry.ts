// Retry Service
// Handles retry logic with exponential backoff

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;    // Base delay in milliseconds
  maxDelay: number;     // Maximum delay in milliseconds
  backoffMultiplier: number;
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  totalDuration: number;
}

const DEFAULT_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelay: 2000,      // 2 seconds
  maxDelay: 30000,      // 30 seconds
  backoffMultiplier: 2,
};

/**
 * Execute a function with retry logic and exponential backoff
 */
export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<RetryResult<T>> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const startTime = Date.now();
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= fullConfig.maxAttempts; attempt++) {
    try {
      const result = await fn();
      return {
        success: true,
        result,
        attempts: attempt,
        totalDuration: Date.now() - startTime,
      };
    } catch (error) {
      lastError = error as Error;

      // If this was the last attempt, don't wait
      if (attempt === fullConfig.maxAttempts) {
        break;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        fullConfig.baseDelay * Math.pow(fullConfig.backoffMultiplier, attempt - 1),
        fullConfig.maxDelay
      );

      // Wait before retrying
      await sleep(delay);
    }
  }

  return {
    success: false,
    error: lastError,
    attempts: fullConfig.maxAttempts,
    totalDuration: Date.now() - startTime,
  };
}

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a retry config from step retry_count
 */
export function createRetryConfig(retryCount: number): Partial<RetryConfig> {
  return {
    maxAttempts: retryCount + 1, // retry_count is additional attempts after first
    baseDelay: 2000,
    backoffMultiplier: 2,
  };
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: Error): boolean {
  const retryableMessages = [
    'timeout',
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ENOTFOUND',
    'rate limit',
    'too many requests',
    '500',
    '502',
    '503',
    '504',
  ];

  const errorMessage = error.message.toLowerCase();
  return retryableMessages.some((msg) => errorMessage.includes(msg));
}

/**
 * Execute with retry, but only for retryable errors
 */
export async function executeWithSmartRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<RetryResult<T>> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const startTime = Date.now();
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= fullConfig.maxAttempts; attempt++) {
    try {
      const result = await fn();
      return {
        success: true,
        result,
        attempts: attempt,
        totalDuration: Date.now() - startTime,
      };
    } catch (error) {
      lastError = error as Error;

      // If this was the last attempt, don't wait
      if (attempt === fullConfig.maxAttempts) {
        break;
      }

      // Only retry if error is retryable
      if (!isRetryableError(lastError)) {
        break;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        fullConfig.baseDelay * Math.pow(fullConfig.backoffMultiplier, attempt - 1),
        fullConfig.maxDelay
      );

      // Wait before retrying
      await sleep(delay);
    }
  }

  return {
    success: false,
    error: lastError,
    attempts: Math.min(fullConfig.maxAttempts, lastError && isRetryableError(lastError) ? fullConfig.maxAttempts : 1),
    totalDuration: Date.now() - startTime,
  };
}
