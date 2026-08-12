// Approval Executor
// Handles execution of approval gate steps (pause/resume logic)

import { StepExecutor, ExecutionContext, ExecutorResult, createSuccessResult, createFailedResult } from './base';

interface ApprovalGateConfig {
  required_role: 'owner' | 'editor';
  message: string;
  timeout_hours?: number;
}

export interface ApprovalResult {
  paused: boolean;
  required_role: string;
  message: string;
  timeout_at?: string;
}

export class ApprovalExecutor implements StepExecutor {
  async execute(config: ApprovalGateConfig, context: ExecutionContext): Promise<ExecutorResult> {
    const startTime = Date.now();

    try {
      // Validate config
      if (!config.required_role || !config.message) {
        return createFailedResult('Missing required approval config fields: required_role, message');
      }

      // Calculate timeout if specified
      let timeoutAt: string | undefined;
      if (config.timeout_hours && config.timeout_hours > 0) {
        const timeoutDate = new Date();
        timeoutDate.setHours(timeoutDate.getHours() + config.timeout_hours);
        timeoutAt = timeoutDate.toISOString();
      }

      // The approval gate doesn't actually "complete" - it signals a pause
      // The workflow executor will handle the actual pause logic
      const output: ApprovalResult = {
        paused: true,
        required_role: config.required_role,
        message: config.message,
        timeout_at: timeoutAt,
      };

      const metadata = {
        duration_ms: Date.now() - startTime,
      };

      return createSuccessResult(output, metadata);
    } catch (error) {
      return createFailedResult(`Approval gate failed: ${error.message}`);
    }
  }
}

// Stub Approval executor for testing
export class StubApprovalExecutor implements StepExecutor {
  async execute(config: ApprovalGateConfig, context: ExecutionContext): Promise<ExecutorResult> {
    const startTime = Date.now();

    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 100));

    const output: ApprovalResult = {
      paused: true,
      required_role: config.required_role,
      message: config.message,
      stubbed: true,
    };

    const metadata = {
      duration_ms: Date.now() - startTime,
    };

    return createSuccessResult(output, metadata);
  }
}
