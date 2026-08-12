// webhookTrigger Hasura Action
// Handles inbound webhook requests to trigger workflows

import { graphqlRequest } from '../../utils/nhost';
import { checkQuota } from '../../services/quota';
import { pushJob } from '../worker/queue';
import { validateWebhookSignature } from '../../services/encryption';

type Input = {
  workflow_id: string;
  payload?: any;
  signature?: string;
};

type Response = {
  success: boolean;
  run_id?: string;
  message: string;
};

export default async function webhookTrigger(
  req: any,
  res: any
): Promise<Response> {
  const { input } = req.body;
  const { workflow_id, payload, signature } = input as Input;

  console.log(`[webhookTrigger] Webhook received for workflow: ${workflow_id}`);

  try {
    // 1. Get workflow and verify it exists
    const workflowQuery = `
      query GetWorkflow($workflowId: uuid!) {
        workflows_by_pk(id: $workflowId) {
          id
          org_id
          name
          status
          deleted_at
        }
      }
    `;

    const { data: workflowData, error: workflowError } = await graphqlRequest(
      workflowQuery,
      { workflowId: workflow_id }
    );

    if (workflowError || !workflowData?.workflows_by_pk) {
      return {
        success: false,
        message: 'Workflow not found',
      };
    }

    const workflow = workflowData.workflows_by_pk;

    // Check if workflow is soft deleted
    if (workflow.deleted_at) {
      return {
        success: false,
        message: 'Workflow has been deleted',
      };
    }

    // Check if workflow is active
    if (workflow.status !== 'active') {
      return {
        success: false,
        message: `Workflow is ${workflow.status} and cannot be triggered via webhook`,
      };
    }

    // 2. Verify webhook trigger is enabled
    const triggerQuery = `
      query GetWebhookTrigger($workflowId: uuid!) {
        workflow_triggers(
          where: {
            workflow_id: { _eq: $workflowId }
            trigger_type: { _eq: "webhook" }
            is_active: { _eq: true }
          }
        ) {
          id
          config
        }
      }
    `;

    const { data: triggerData, error: triggerError } = await graphqlRequest(
      triggerQuery,
      { workflowId: workflow_id }
    );

    if (triggerError || !triggerData?.workflow_triggers?.length) {
      return {
        success: false,
        message: 'Webhook trigger not enabled for this workflow',
      };
    }

    const trigger = triggerData.workflow_triggers[0];

    // 3. Validate webhook signature if configured
    if (trigger.config?.secret && signature) {
      const payloadString = JSON.stringify(payload || {});
      const isValid = validateWebhookSignature(payloadString, signature, trigger.config.secret);

      if (!isValid) {
        return {
          success: false,
          message: 'Invalid webhook signature',
        };
      }
    }

    // 4. Check quota
    const quota = await checkQuota(workflow.org_id);

    if (!quota.allowed) {
      return {
        success: false,
        message: `Quota exceeded. Used: ${quota.quotaUsed}/${quota.quotaLimit}`,
      };
    }

    // 5. Get workflow steps
    const stepsQuery = `
      query GetSteps($workflowId: uuid!) {
        workflow_steps(
          where: { workflow_id: { _eq: $workflowId } }
          order_by: { order_index: asc }
        ) {
          id
          step_type
          name
          order_index
        }
      }
    `;

    const { data: stepsData, error: stepsError } = await graphqlRequest(
      stepsQuery,
      { workflowId: workflow_id }
    );

    if (stepsError || !stepsData?.workflow_steps?.length) {
      return {
        success: false,
        message: 'Workflow has no steps',
      };
    }

    // 6. Create workflow_run
    const createRunMutation = `
      mutation CreateWorkflowRun($object: workflow_runs_insert_input!) {
        insert_workflow_runs_one(object: $object) {
          id
          workflow_id
          status
        }
      }
    `;

    const { data: runData, error: runError } = await graphqlRequest(
      createRunMutation,
      {
        object: {
          workflow_id: workflow_id,
          workflow_version: 1,
          status: 'pending',
          current_step_index: 0,
          execution_state: {},
          trigger_type: 'webhook',
          trigger_data: payload || {},
        },
      }
    );

    if (runError || !runData?.insert_workflow_runs_one) {
      return {
        success: false,
        message: 'Failed to create workflow run',
      };
    }

    const runId = runData.insert_workflow_runs_one.id;

    // 7. Create step_runs for all steps
    const stepRuns = stepsData.workflow_steps.map((step: any) => ({
      workflow_run_id: runId,
      step_id: step.id,
      step_type: step.step_type,
      order_index: step.order_index,
      status: 'pending',
      attempt_count: 0,
      max_attempts: 3,
    }));

    const createStepRunsMutation = `
      mutation CreateStepRuns($objects: [step_runs_insert_input!]!) {
        insert_step_runs(objects: $objects) {
          affected_rows
        }
      }
    `;

    const { error: stepRunsError } = await graphqlRequest(createStepRunsMutation, {
      objects: stepRuns,
    });

    if (stepRunsError) {
      return {
        success: false,
        message: 'Failed to create step runs',
      };
    }

    // 8. Push job to queue
    const jobId = await pushJob('executeWorkflow', { workflowRunId: runId }, 10);

    console.log(`[webhookTrigger] Workflow run created: ${runId}, job: ${jobId}`);

    return {
      success: true,
      run_id: runId,
      message: 'Workflow triggered via webhook',
    };
  } catch (error) {
    console.error('[webhookTrigger] Error:', error);
    return {
      success: false,
      message: `Internal error: ${error.message}`,
    };
  }
}
