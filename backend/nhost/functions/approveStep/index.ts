// approveStep Hasura Action
// Called when a user approves or rejects an approval gate step

import { graphqlRequest } from '../../utils/nhost';
import { canApproveStep } from '../../services/permission';
import { pushJob } from '../worker/queue';

type Input = {
  step_run_id: string;
  approved: boolean;
};

type Response = {
  success: boolean;
  message: string;
};

export default async function approveStep(
  req: any,
  res: any
): Promise<Response> {
  const { session_variables, input } = req.body;
  const userId = session_variables['x-hasura-user-id'];
  const { step_run_id, approved } = input as Input;

  console.log(`[approveStep] User ${userId} ${approved ? 'approving' : 'rejecting'} step ${step_run_id}`);

  try {
    // 1. Get step run and verify it's an approval gate
    const stepRunQuery = `
      query GetStepRun($stepRunId: uuid!) {
        step_runs_by_pk(id: $stepRunId) {
          id
          step_type
          status
          workflow_run_id
          workflow_run {
            id
            status
            current_step_index
            workflow {
              id
              org_id
            }
          }
        }
      }
    `;

    const { data: stepRunData, error: stepRunError } = await graphqlRequest(
      stepRunQuery,
      { stepRunId: step_run_id }
    );

    if (stepRunError || !stepRunData?.step_runs_by_pk) {
      return {
        success: false,
        message: 'Step run not found',
      };
    }

    const stepRun = stepRunData.step_runs_by_pk;

    // 2. Verify step type
    if (stepRun.step_type !== 'approval_gate') {
      return {
        success: false,
        message: 'This step is not an approval gate',
      };
    }

    // 3. Verify step is awaiting approval
    if (stepRun.status !== 'awaiting_approval') {
      return {
        success: false,
        message: `Step is not awaiting approval (current status: ${stepRun.status})`,
      };
    }

    // 4. Verify workflow run is paused
    if (stepRun.workflow_run.status !== 'paused') {
      return {
        success: false,
        message: 'Workflow run is not paused',
      };
    }

    // 5. Check permission (Layer 2)
    const permissionCheck = await canApproveStep(userId, step_run_id);

    if (!permissionCheck.allowed) {
      return {
        success: false,
        message: 'You do not have permission to approve this step',
      };
    }

    if (approved) {
      // 6a. Approve: Update step_run
      const updateStepRunMutation = `
        mutation ApproveStepRun($id: uuid!, $userId: uuid!) {
          update_step_runs_by_pk(
            pk_columns: { id: $id }
            _set: {
              status: "completed"
              approved_by: $userId
              approved_at: now()
            }
          ) {
            id
            status
          }
        }
      `;

      const { error: updateError } = await graphqlRequest(updateStepRunMutation, {
        id: step_run_id,
        userId,
      });

      if (updateError) {
        return {
          success: false,
          message: 'Failed to update step run',
        };
      }

      // 7a. Update workflow_run status and increment step index
      const updateRunMutation = `
        mutation ResumeWorkflowRun($id: uuid!) {
          update_workflow_runs_by_pk(
            pk_columns: { id: $id }
            _set: {
              status: "running"
              current_step_index: 1
            }
          ) {
            id
            status
          }
        }
      `;

      // Get current step index and increment
      const currentStepIndex = stepRun.workflow_run.current_step_index;
      const { error: runError } = await graphqlRequest(
        `
        mutation ResumeWorkflowRun($id: uuid!, $nextIndex: Int!) {
          update_workflow_runs_by_pk(
            pk_columns: { id: $id }
            _set: {
              status: "running"
              current_step_index: $nextIndex
            }
          ) {
            id
            status
          }
        }
      `,
        {
          id: stepRun.workflow_run_id,
          nextIndex: currentStepIndex + 1,
        }
      );

      if (runError) {
        return {
          success: false,
          message: 'Failed to resume workflow run',
        };
      }

      // 8a. Push job to queue for resume
      const jobId = await pushJob(
        'resumeWorkflow',
        { workflowRunId: stepRun.workflow_run_id },
        10
      );

      console.log(`[approveStep] Step approved, workflow resumed. Job: ${jobId}`);

      // 9a. Log approval
      await logExecution(stepRun.workflow_run_id, step_run_id, 'step_approved', {
        approved_by: userId,
      });

      return {
        success: true,
        message: 'Step approved and workflow resumed',
      };
    } else {
      // 6b. Reject: Update step_run
      const updateStepRunMutation = `
        mutation RejectStepRun($id: uuid!) {
          update_step_runs_by_pk(
            pk_columns: { id: $id }
            _set: {
              status: "failed"
              error_message: "Rejected by user"
            }
          ) {
            id
            status
          }
        }
      `;

      const { error: updateError } = await graphqlRequest(updateStepRunMutation, {
        id: step_run_id,
      });

      if (updateError) {
        return {
          success: false,
          message: 'Failed to update step run',
        };
      }

      // 7b. Update workflow_run to failed
      const updateRunMutation = `
        mutation FailWorkflowRun($id: uuid!) {
          update_workflow_runs_by_pk(
            pk_columns: { id: $id }
            _set: {
              status: "failed"
              error_message: "Approval rejected by user"
            }
          ) {
            id
            status
          }
        }
      `;

      const { error: runError } = await graphqlRequest(updateRunMutation, {
        id: stepRun.workflow_run_id,
      });

      if (runError) {
        return {
          success: false,
          message: 'Failed to update workflow run',
        };
      }

      console.log(`[approveStep] Step rejected, workflow failed`);

      // 8b. Log rejection
      await logExecution(stepRun.workflow_run_id, step_run_id, 'step_rejected', {
        rejected_by: userId,
      });

      return {
        success: true,
        message: 'Step rejected and workflow stopped',
      };
    }
  } catch (error) {
    console.error('[approveStep] Error:', error);
    return {
      success: false,
      message: `Internal error: ${error.message}`,
    };
  }
}

async function logExecution(
  workflowRunId: string,
  stepRunId: string,
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
