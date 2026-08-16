// Workflow Executor
// Main execution engine for running workflows

import { graphqlRequest } from '../../../utils/nhost';
import { resolveVariables, buildStepOutputs, getPreviousOutput, VariableContext } from '../../../utils/variables';
import { executeWithRetry, createRetryConfig } from '../../../services/retry';
import { incrementQuota, isBillableStep } from '../../../services/quota';
import { StepExecutor, ExecutionContext, ExecutorResult } from './executors/base';
import { LLMExecutor, StubLLMExecutor } from './executors/LLMExecutor';
import { HTTPExecutor, StubHTTPExecutor } from './executors/HTTPExecutor';
import { DBWriteExecutor, StubDBWriteExecutor } from './executors/DBWriteExecutor';
import { NotifyExecutor, StubNotifyExecutor } from './executors/NotifyExecutor';
import { ConditionExecutor, StubConditionExecutor } from './executors/ConditionExecutor';
import { ApprovalExecutor, StubApprovalExecutor } from './executors/ApprovalExecutor';

// Use stub executors if no API keys are configured
const useStub = !process.env.GROQ_API_KEY && !process.env.OPENROUTER_API_KEY;

const executors: Record<string, StepExecutor> = {
  llm_call: useStub ? new StubLLMExecutor() : new LLMExecutor(),
  http_request: useStub ? new StubHTTPExecutor() : new HTTPExecutor(),
  db_write: useStub ? new StubDBWriteExecutor() : new DBWriteExecutor(),
  notify: useStub ? new StubNotifyExecutor() : new NotifyExecutor(),
  conditional_branch: useStub ? new StubConditionExecutor() : new ConditionExecutor(),
  approval_gate: useStub ? new StubApprovalExecutor() : new ApprovalExecutor(),
};

interface WorkflowData {
  id: string;
  org_id: string;
  current_version: number;
}

interface StepData {
  id: string;
  step_type: string;
  name: string;
  order_index: number;
  config: any;
  timeout_seconds: number;
  retry_count: number;
}

interface StepRunData {
  id: string;
  step_id: string;
  step_type: string;
  order_index: number;
  status: string;
  input: any;
  output: any;
  attempt_count: number;
  max_attempts: number;
}

interface WorkflowRunData {
  id: string;
  workflow_id: string;
  workflow_version: number;
  status: string;
  current_step_index: number;
  execution_state: any;
  trigger_type: string;
  trigger_data: any;
}

/**
 * Execute a workflow run
 */
export async function executeWorkflow(workflowRunId: string): Promise<void> {
  console.log(`[WorkflowExecutor] Starting execution for run: ${workflowRunId}`);

  // 1. Load workflow run
  const workflowRun = await loadWorkflowRun(workflowRunId);
  if (!workflowRun) {
    throw new Error(`Workflow run not found: ${workflowRunId}`);
  }

  // 2. Load workflow
  const workflow = await loadWorkflow(workflowRun.workflow_id);
  if (!workflow) {
    throw new Error(`Workflow not found: ${workflowRun.workflow_id}`);
  }

  // 3. Load steps (ordered)
  const steps = await loadSteps(workflowRun.workflow_id);
  if (!steps.length) {
    throw new Error(`No steps found for workflow: ${workflowRun.workflow_id}`);
  }

  // 4. Load step runs
  const stepRuns = await loadStepRuns(workflowRunId);

  // 5. Start from current_step_index
  let currentIndex = workflowRun.current_step_index;

  // 6. Update workflow_run status to running
  await updateWorkflowRun(workflowRunId, {
    status: 'running',
    started_at: new Date().toISOString(),
  });

  console.log(`[WorkflowExecutor] Starting from step index: ${currentIndex}`);

  // 7. Execute steps sequentially
  while (currentIndex < steps.length) {
    const step = steps[currentIndex];
    const stepRun = stepRuns.find(sr => sr.order_index === currentIndex);

    if (!stepRun) {
      console.error(`[WorkflowExecutor] Step run not found for index: ${currentIndex}`);
      break;
    }

    console.log(`[WorkflowExecutor] Executing step: ${step.name} (${step.step_type})`);

    // 8. Update step_run to 'running'
    await updateStepRun(stepRun.id, {
      status: 'running',
      started_at: new Date().toISOString(),
      attempt_count: stepRun.attempt_count + 1,
      last_attempt_at: new Date().toISOString(),
    });

    // 9. Get previous output for variable resolution
    const previousOutput = getPreviousOutput(
      stepRuns.map(sr => ({ output: sr.output, order_index: sr.order_index })),
      currentIndex
    );

    // 10. Build variable context
    const variableContext: VariableContext = {
      previous: { output: previousOutput },
      steps: buildStepOutputs(
        stepRuns.map(sr => ({ step_type: sr.step_type, output: sr.output, order_index: sr.order_index })),
        currentIndex
      ),
      variables: workflowRun.execution_state || {},
      trigger: workflowRun.trigger_data,
      now: new Date().toISOString(),
    };

    // 11. Resolve variables in step config
    const resolvedConfig = resolveVariables(step.config, variableContext);

    // 12. Get executor for step type
    const executor = executors[step.step_type];
    if (!executor) {
      await updateStepRun(stepRun.id, {
        status: 'failed',
        error_message: `No executor found for step type: ${step.step_type}`,
        completed_at: new Date().toISOString(),
      });
      break;
    }

    // 13. Execute with retry
    const retryConfig = createRetryConfig(step.retry_count);
    const result = await executeWithRetry(
      () => executor.execute(resolvedConfig, {
        previousOutput,
        stepOutputs: variableContext.steps || {},
        variables: variableContext.variables || {},
        triggerData: workflowRun.trigger_data,
        workflowRunId,
        stepRunId: stepRun.id,
      }),
      retryConfig
    );

    // 14. Handle approval gate (special case - pause execution)
    if (step.step_type === 'approval_gate' && result.success && result.result?.output?.paused) {
      console.log(`[WorkflowExecutor] Approval gate hit, pausing execution`);

      await updateStepRun(stepRun.id, {
        status: 'awaiting_approval',
        output: result.result.output,
      });

      await updateWorkflowRun(workflowRunId, {
        status: 'paused',
        current_step_index: currentIndex,
        paused_at: new Date().toISOString(),
      });

      // Log pause event
      await logExecution(workflowRunId, stepRun.id, 'awaiting_approval', {
        message: resolvedConfig.message,
        required_role: resolvedConfig.required_role,
      });

      console.log(`[WorkflowExecutor] Workflow paused at step: ${step.name}`);
      return; // Stop execution
    }

    // 15. Handle step result
    if (result.success) {
      await updateStepRun(stepRun.id, {
        status: 'completed',
        output: result.result.output,
        completed_at: new Date().toISOString(),
      });

      // Log completion
      await logExecution(workflowRunId, stepRun.id, 'step_completed', {
        step_type: step.step_type,
        duration_ms: result.result.metadata?.duration_ms,
      });

      // Increment quota for billable steps
      if (isBillableStep(step.step_type)) {
        await incrementQuota(workflow.org_id);
      }
    } else {
      await updateStepRun(stepRun.id, {
        status: 'failed',
        error_message: result.error?.message || 'Step execution failed',
        completed_at: new Date().toISOString(),
      });

      // Log failure
      await logExecution(workflowRunId, stepRun.id, 'step_failed', {
        step_type: step.step_type,
        error: result.error?.message,
        attempts: result.attempts,
      });

      // Update workflow_run to failed
      await updateWorkflowRun(workflowRunId, {
        status: 'failed',
        error_message: `Step "${step.name}" failed: ${result.error?.message}`,
        completed_at: new Date().toISOString(),
      });

      console.log(`[WorkflowExecutor] Workflow failed at step: ${step.name}`);
      return; // Stop execution
    }

    // 16. Move to next step (or branch if conditional)
    if (step.step_type === 'conditional_branch' && result.result?.output?.next_step_index !== undefined) {
      const targetIndex = result.result.output.next_step_index;
      // Only allow forward jumps (prevent infinite loops)
      if (targetIndex > currentIndex) {
        currentIndex = Math.min(targetIndex, steps.length - 1);
      } else {
        currentIndex++;
      }
      console.log(`[WorkflowExecutor] Conditional branch: jumping to step index ${currentIndex}`);
    } else {
      currentIndex++;
    }
  }

  // 17. All steps completed
  await updateWorkflowRun(workflowRunId, {
    status: 'completed',
    completed_at: new Date().toISOString(),
  });

  // Log completion
  await logExecution(workflowRunId, null, 'workflow_completed', {
    total_steps: steps.length,
  });

  console.log(`[WorkflowExecutor] Workflow completed successfully`);
}

// ============================================================================
// Database Operations
// ============================================================================

async function loadWorkflowRun(id: string): Promise<WorkflowRunData | null> {
  const query = `
    query GetWorkflowRun($id: uuid!) {
      workflow_runs_by_pk(id: $id) {
        id
        workflow_id
        workflow_version
        status
        current_step_index
        execution_state
        trigger_type
        trigger_data
      }
    }
  `;

  const { data, error } = await graphqlRequest(query, { id });
  return data?.workflow_runs_by_pk || null;
}

async function loadWorkflow(id: string): Promise<WorkflowData | null> {
  const query = `
    query GetWorkflow($id: uuid!) {
      workflows_by_pk(id: $id) {
        id
        org_id
        current_version
      }
    }
  `;

  const { data, error } = await graphqlRequest(query, { id });
  return data?.workflows_by_pk || null;
}

async function loadSteps(workflowId: string): Promise<StepData[]> {
  const query = `
    query GetSteps($workflowId: uuid!) {
      workflow_steps(
        where: { workflow_id: { _eq: $workflowId } }
        order_by: { order_index: asc }
      ) {
        id
        step_type
        name
        order_index
        config
        timeout_seconds
        retry_count
      }
    }
  `;

  const { data, error } = await graphqlRequest(query, { workflowId });
  return data?.workflow_steps || [];
}

async function loadStepRuns(workflowRunId: string): Promise<StepRunData[]> {
  const query = `
    query GetStepRuns($workflowRunId: uuid!) {
      step_runs(
        where: { workflow_run_id: { _eq: $workflowRunId } }
        order_by: { order_index: asc }
      ) {
        id
        step_id
        step_type
        order_index
        status
        input
        output
        attempt_count
        max_attempts
      }
    }
  `;

  const { data, error } = await graphqlRequest(query, { workflowRunId });
  return data?.step_runs || [];
}

async function updateWorkflowRun(id: string, updates: Partial<WorkflowRunData>): Promise<void> {
  const mutation = `
    mutation UpdateWorkflowRun($id: uuid!, $updates: workflow_runs_set_input!) {
      update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: $updates) {
        id
      }
    }
  `;

  await graphqlRequest(mutation, { id, updates });
}

async function updateStepRun(id: string, updates: any): Promise<void> {
  const mutation = `
    mutation UpdateStepRun($id: uuid!, $updates: step_runs_set_input!) {
      update_step_runs_by_pk(pk_columns: { id: $id }, _set: $updates) {
        id
      }
    }
  `;

  await graphqlRequest(mutation, { id, updates });
}

async function logExecution(
  workflowRunId: string,
  stepRunId: string | null,
  eventType: string,
  eventData: any
): Promise<void> {
  const mutation = `
    mutation LogExecution($object: execution_logs_insert_input!) {
      insert_execution_logs_one(object: $object) {
        id
      }
    }
  `;

  await graphqlRequest(mutation, {
    object: {
      workflow_run_id: workflowRunId,
      step_run_id: stepRunId,
      event_type: eventType,
      event_data: eventData,
    },
  });
}
