// triggerWorkflowRun Hasura Action
// Called when a user clicks "Run" or triggers a workflow

import { graphqlRequest } from '../../utils/nhost';
import { checkOrgMembership, canAddStepType } from '../../services/permission';
import { checkQuota } from '../../services/quota';
import { pushJob } from '../worker/queue';

type Input = {
  workflow_id: string;
};

type Response = {
  success: boolean;
  run_id?: string;
  message: string;
};

export default async function triggerWorkflowRun(
  req: any,
  res: any
): Promise<Response> {
  const { session_variables, input } = req.body;
  const userId = session_variables['x-hasura-user-id'];
  const { workflow_id } = input as Input;

  console.log(`[triggerWorkflowRun] User ${userId} triggering workflow ${workflow_id}`);

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
    if (workflow.status !== 'active' && workflow.status !== 'draft') {
      return {
        success: false,
        message: `Workflow is ${workflow.status} and cannot be triggered`,
      };
    }

    // 2. Verify user has permission to trigger
    const membership = await checkOrgMembership(userId, workflow.org_id);

    if (!membership.hasAccess) {
      return {
        success: false,
        message: 'You do not have access to this organization',
      };
    }

    if (membership.role !== 'owner' && membership.role !== 'editor') {
      return {
        success: false,
        message: 'Only owners and editors can trigger workflows',
      };
    }

    // 3. Check quota
    const quota = await checkQuota(workflow.org_id);

    if (!quota.allowed) {
      return {
        success: false,
        message: `Quota exceeded. Used: ${quota.quotaUsed}/${quota.quotaLimit}. Resets at: ${quota.resetAt}`,
      };
    }

    // 4. Get workflow steps
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

    // 5. Verify step permissions (Layer 2)
    for (const step of stepsData.workflow_steps) {
      const canAdd = await canAddStepType(userId, workflow.org_id, step.step_type);
      if (!canAdd) {
        return {
          success: false,
          message: `You don't have permission to run workflows with ${step.step_type} steps`,
        };
      }
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
          workflow_version: workflow.current_version || 1,
          status: 'pending',
          current_step_index: 0,
          execution_state: {},
          trigger_type: 'manual',
          trigger_data: { user_id: userId },
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

    console.log(`[triggerWorkflowRun] Workflow run created: ${runId}, job: ${jobId}`);

    return {
      success: true,
      run_id: runId,
      message: 'Workflow triggered successfully',
    };
  } catch (error) {
    console.error('[triggerWorkflowRun] Error:', error);
    return {
      success: false,
      message: `Internal error: ${error.message}`,
    };
  }
}
