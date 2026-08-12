// DB Write Executor
// Handles execution of database write steps

import { StepExecutor, ExecutionContext, ExecutorResult, createSuccessResult, createFailedResult } from './base';
import { graphqlRequest } from '../../../utils/nhost';

interface DBWriteConfig {
  table: string;
  operation: 'insert' | 'update';
  columns: Record<string, any>;
  where?: Record<string, any>;
}

// Whitelist of allowed tables (for security)
const ALLOWED_TABLES = [
  'onboarding_records',
  'customer_data',
  'audit_logs',
  'custom_data',
];

export class DBWriteExecutor implements StepExecutor {
  async execute(config: DBWriteConfig, context: ExecutionContext): Promise<ExecutorResult> {
    const startTime = Date.now();

    try {
      // Validate config
      if (!config.table || !config.operation || !config.columns) {
        return createFailedResult('Missing required DB write config fields: table, operation, columns');
      }

      // Validate table name (whitelist)
      if (!ALLOWED_TABLES.includes(config.table)) {
        return createFailedResult(
          `Table not allowed: ${config.table}. Allowed tables: ${ALLOWED_TABLES.join(', ')}`
        );
      }

      // Validate operation
      if (!['insert', 'update'].includes(config.operation)) {
        return createFailedResult('Invalid operation. Must be "insert" or "update"');
      }

      let result: any;

      if (config.operation === 'insert') {
        result = await this.executeInsert(config);
      } else {
        result = await this.executeUpdate(config);
      }

      const metadata = {
        duration_ms: Date.now() - startTime,
      };

      return createSuccessResult(result, metadata);
    } catch (error) {
      return createFailedResult(`Database write failed: ${error.message}`);
    }
  }

  private async executeInsert(config: DBWriteConfig): Promise<any> {
    // Build Hasura-compatible mutation
    const mutation = `
      mutation InsertRow($object: ${config.table}_insert_input!) {
        insert_${config.table}_one(object: $object) {
          id
          created_at
        }
      }
    `;

    const variables = {
      object: config.columns,
    };

    const { data, error } = await graphqlRequest(mutation, variables);

    if (error) {
      throw new Error(error.message || 'Insert failed');
    }

    return {
      operation: 'insert',
      affected_rows: 1,
      returning: data?.[`insert_${config.table}_one`],
    };
  }

  private async executeUpdate(config: DBWriteConfig): Promise<any> {
    if (!config.where || Object.keys(config.where).length === 0) {
      throw new Error('WHERE clause required for update operation');
    }

    // Build Hasura-compatible mutation
    // Note: This is simplified - in production, you'd need more complex WHERE handling
    const mutation = `
      mutation UpdateRows($where: ${config.table}_bool_exp!, $set: ${config.table}_set_input!) {
        update_${config.table}(where: $where, _set: $set) {
          affected_rows
        }
      }
    `;

    const variables = {
      where: config.where,
      set: config.columns,
    };

    const { data, error } = await graphqlRequest(mutation, variables);

    if (error) {
      throw new Error(error.message || 'Update failed');
    }

    return {
      operation: 'update',
      affected_rows: data?.[`update_${config.table}`]?.affected_rows || 0,
    };
  }
}

// Stub DB Write executor for testing
export class StubDBWriteExecutor implements StepExecutor {
  async execute(config: DBWriteConfig, context: ExecutionContext): Promise<ExecutorResult> {
    const startTime = Date.now();

    // Simulate database delay
    await new Promise(resolve => setTimeout(resolve, 200));

    // Generate mock result
    const output = {
      operation: config.operation,
      affected_rows: 1,
      returning: {
        id: 'mock-id-' + Date.now(),
        created_at: new Date().toISOString(),
        ...config.columns,
      },
      stubbed: true,
    };

    const metadata = {
      duration_ms: Date.now() - startTime,
    };

    return createSuccessResult(output, metadata);
  }
}
