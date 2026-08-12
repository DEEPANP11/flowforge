// Variable Resolver Utility
// Resolves template variables in step configurations

export interface VariableContext {
  previous?: {
    output: any;
  };
  steps?: Record<string, any>;
  variables?: Record<string, any>;
  trigger?: any;
  now?: string;
}

/**
 * Resolve variables in a string template
 * Supports:
 * - {{previous.output.field}} - Previous step output
 * - {{steps.step_name.output.field}} - Specific step output
 * - {{variables.var_name}} - Workflow variables
 * - {{trigger.field}} - Trigger data
 * - {{now}} - Current timestamp
 */
export function resolveString(
  template: string,
  context: VariableContext
): string {
  if (!template) return template;

  return template.replace(
    /\{\{([^}]+)\}\}/g,
    (match, path) => {
      const value = resolvePath(path.trim(), context);
      return value !== undefined ? String(value) : match;
    }
  );
}

/**
 * Resolve variables in an object (deep traversal)
 */
export function resolveVariables<T = any>(
  obj: T,
  context: VariableContext
): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return resolveString(obj, context) as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => resolveVariables(item, context)) as T;
  }

  if (typeof obj === 'object') {
    const resolved: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      resolved[key] = resolveVariables(value, context);
    }
    return resolved as T;
  }

  return obj;
}

/**
 * Resolve a dot-notation path against the context
 */
function resolvePath(path: string, context: VariableContext): any {
  const parts = path.split('.');
  let current: any = context;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }

    // Handle array index notation (e.g., steps[0])
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

/**
 * Build step outputs context from step runs
 */
export function buildStepOutputs(
  stepRuns: Array<{ step_type: string; output: any; order_index: number }>,
  upToIndex: number
): Record<string, any> {
  const outputs: Record<string, any> = {};

  for (const stepRun of stepRuns) {
    if (stepRun.order_index >= upToIndex) {
      break;
    }

    // Use step type and index as key
    const key = `${stepRun.step_type}_${stepRun.order_index}`;
    outputs[key] = stepRun.output;

    // Also store as "previous" for the next step
    if (stepRun.order_index === upToIndex - 1) {
      outputs['previous'] = stepRun.output;
    }
  }

  return outputs;
}

/**
 * Get the previous step output
 */
export function getPreviousOutput(
  stepRuns: Array<{ output: any; order_index: number }>,
  currentIndex: number
): any {
  const previousRun = stepRuns.find(
    (sr) => sr.order_index === currentIndex - 1
  );
  return previousRun?.output || null;
}

/**
 * Validate variable template syntax
 */
export function validateTemplate(template: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const regex = /\{\{([^}]+)\}\}/g;
  let match;

  while ((match = regex.exec(template)) !== null) {
    const path = match[1].trim();
    const parts = path.split('.');

    if (parts.length < 2) {
      errors.push(`Invalid variable path: ${path}. Must have at least 2 parts (e.g., previous.output)`);
    }

    const validPrefixes = ['previous', 'steps', 'variables', 'trigger', 'now'];
    if (!validPrefixes.includes(parts[0])) {
      errors.push(`Invalid variable prefix: ${parts[0]}. Must be one of: ${validPrefixes.join(', ')}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Extract all variables from a template
 */
export function extractVariables(template: string): string[] {
  const variables: string[] = [];
  const regex = /\{\{([^}]+)\}\}/g;
  let match;

  while ((match = regex.exec(template)) !== null {
    variables.push(match[1].trim());
  }

  return variables;
}
