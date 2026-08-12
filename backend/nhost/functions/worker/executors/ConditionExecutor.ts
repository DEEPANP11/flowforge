// Condition Executor
// Handles execution of conditional branch steps

import { StepExecutor, ExecutionContext, ExecutorResult, createSuccessResult, createFailedResult } from './base';

interface ConditionConfig {
  condition: {
    left: string;
    operator: '==' | '!=' | '>' | '<' | '>=' | '<=' | 'contains' | 'not_contains' | 'starts_with' | 'ends_with';
    right: string;
  };
  true_next_step_index: number;
  false_next_step_index: number;
}

export class ConditionExecutor implements StepExecutor {
  async execute(config: ConditionConfig, context: ExecutionContext): Promise<ExecutorResult> {
    const startTime = Date.now();

    try {
      // Validate config
      if (!config.condition || config.true_next_step_index === undefined || config.false_next_step_index === undefined) {
        return createFailedResult('Missing required condition config fields');
      }

      // Resolve left and right values
      const leftValue = this.resolveValue(config.condition.left, context);
      const rightValue = this.resolveValue(config.condition.right, context);

      // Evaluate condition
      const conditionMet = this.evaluateCondition(leftValue, config.condition.operator, rightValue);

      // Determine next step
      const nextStepIndex = conditionMet ? config.true_next_step_index : config.false_next_step_index;

      const output = {
        condition_met: conditionMet,
        left_value: leftValue,
        operator: config.condition.operator,
        right_value: rightValue,
        next_step_index: nextStepIndex,
        branch: conditionMet ? 'true' : 'false',
      };

      const metadata = {
        duration_ms: Date.now() - startTime,
      };

      return createSuccessResult(output, metadata);
    } catch (error) {
      return createFailedResult(`Condition evaluation failed: ${error.message}`);
    }
  }

  private resolveValue(value: string, context: ExecutionContext): any {
    // Handle template variables
    if (value.startsWith('{{') && value.endsWith('}}')) {
      const path = value.slice(2, -2).trim();
      return this.resolvePath(path, context);
    }

    // Handle numeric values
    if (!isNaN(Number(value))) {
      return Number(value);
    }

    // Handle boolean values
    if (value === 'true') return true;
    if (value === 'false') return false;

    // Handle null
    if (value === 'null' || value === 'undefined') return null;

    // Return as string
    return value;
  }

  private resolvePath(path: string, context: ExecutionContext): any {
    const parts = path.split('.');

    // Handle step_N.output pattern — look up step output by index
    const stepMatch = parts[0]?.match(/^step_?(\d+)$/);
    if (stepMatch) {
      const stepIdx = parseInt(stepMatch[1], 10);
      // Try stepOutputs[step_0], stepOutputs[0], or stepOutputs[llm_call_0]
      const stepOutputs = (context as any).stepOutputs || (context as any).steps || {};
      let output = stepOutputs[`step_${stepIdx}`];
      if (!output) output = stepOutputs[stepIdx];
      if (!output) {
        // Search by index in keys like llm_call_0
        for (const [key, val] of Object.entries(stepOutputs)) {
          if (key.endsWith(`_${stepIdx}`)) { output = val; break; }
        }
      }
      // Navigate remaining path (e.g., .output.text)
      let current = output;
      for (let i = 1; i < parts.length; i++) {
        if (current === null || current === undefined) return undefined;
        current = current[parts[i]];
      }
      return current;
    }

    // Handle previous.output pattern
    if (parts[0] === 'previous') {
      let current: any = (context as any).previousOutput || (context as any).previous;
      for (let i = 1; i < parts.length; i++) {
        if (current === null || current === undefined) return undefined;
        current = current[parts[i]];
      }
      return current;
    }

    // Default: walk context object
    let current: any = context;
    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
      if (arrayMatch) {
        const [, key, index] = arrayMatch;
        current = current[key];
        if (Array.isArray(current)) {
          current = current[parseInt(index, 10)];
        } else {
          return undefined;
        }
      } else {
        current = current[part];
      }
    }

    return current;
  }

  private evaluateCondition(left: any, operator: string, right: any): boolean {
    // Handle null/undefined
    if (left === null || left === undefined || right === null || right === undefined) {
      if (operator === '==') return left === right;
      if (operator === '!=') return left !== right;
      return false;
    }

    // Convert to strings for comparison
    const leftStr = String(left).toLowerCase();
    const rightStr = String(right).toLowerCase();

    switch (operator) {
      case '==':
        return leftStr === rightStr;
      case '!=':
        return leftStr !== rightStr;
      case '>':
        return Number(left) > Number(right);
      case '<':
        return Number(left) < Number(right);
      case '>=':
        return Number(left) >= Number(right);
      case '<=':
        return Number(left) <= Number(right);
      case 'contains':
        return leftStr.includes(rightStr);
      case 'not_contains':
        return !leftStr.includes(rightStr);
      case 'starts_with':
        return leftStr.startsWith(rightStr);
      case 'ends_with':
        return leftStr.endsWith(rightStr);
      default:
        throw new Error(`Unknown operator: ${operator}`);
    }
  }
}

// Stub Condition executor for testing
export class StubConditionExecutor implements StepExecutor {
  async execute(config: ConditionConfig, context: ExecutionContext): Promise<ExecutorResult> {
    const startTime = Date.now();

    // Simulate evaluation delay
    await new Promise(resolve => setTimeout(resolve, 50));

    // Simple mock: always take true branch
    const output = {
      condition_met: true,
      left_value: '{{previous.output}}',
      operator: config.condition.operator,
      right_value: config.condition.right,
      next_step_index: config.true_next_step_index,
      branch: 'true',
      stubbed: true,
    };

    const metadata = {
      duration_ms: Date.now() - startTime,
    };

    return createSuccessResult(output, metadata);
  }
}
