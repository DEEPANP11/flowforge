// Base Executor Interface
// All step executors must implement this interface

export interface ExecutorResult {
  status: 'completed' | 'failed';
  output: any;
  error?: string;
  metadata?: {
    duration_ms?: number;
    tokens?: {
      prompt: number;
      completion: number;
      total: number;
    };
    cost?: number;
  };
}

export interface ExecutionContext {
  previousOutput: any;
  stepOutputs: Record<string, any>;
  variables: Record<string, any>;
  triggerData?: any;
  workflowRunId: string;
  stepRunId: string;
}

export interface StepExecutor {
  execute(config: any, context: ExecutionContext): Promise<ExecutorResult>;
}

/**
 * Create a successful result
 */
export function createSuccessResult(
  output: any,
  metadata?: ExecutorResult['metadata']
): ExecutorResult {
  return {
    status: 'completed',
    output,
    metadata,
  };
}

/**
 * Create a failed result
 */
export function createFailedResult(
  error: string,
  output?: any
): ExecutorResult {
  return {
    status: 'failed',
    output: output || null,
    error,
  };
}
