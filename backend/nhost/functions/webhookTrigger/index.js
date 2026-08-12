// webhookTrigger - Simplified for nhost dashboard deployment
// Paste this into nhost Functions → webhookTrigger

const NHOST_GRAPHQL_URL = process.env.NHOST_GRAPHQL_URL;
const HASURA_ADMIN_SECRET = process.env.HASURA_ADMIN_SECRET;

async function graphqlRequest(query, variables = {}) {
  const response = await fetch(NHOST_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hasura-admin-secret': HASURA_ADMIN_SECRET,
    },
    body: JSON.stringify({ query, variables }),
  });
  const result = await response.json();
  return result.data;
}

export default async function webhookTrigger(req, res) {
  const { input } = req.body;
  const { workflow_id, payload } = input;

  try {
    // 1. Get workflow
    const workflowData = await graphqlRequest(`
      query GetWorkflow($id: uuid!) {
        workflows_by_pk(id: $id) {
          id, org_id, status, deleted_at, current_version
        }
      }
    `, { id: workflow_id });

    const workflow = workflowData?.workflows_by_pk;
    if (!workflow || workflow.deleted_at) {
      return res.status(200).json({ success: false, message: 'Workflow not found' });
    }

    if (workflow.status !== 'active') {
      return res.status(200).json({ success: false, message: 'Workflow is ' + workflow.status });
    }

    // 2. Check webhook trigger enabled
    const triggerData = await graphqlRequest(`
      query GetTrigger($wfId: uuid!) {
        workflow_triggers(where: { 
          workflow_id: { _eq: $wfId }, 
          trigger_type: { _eq: "webhook" },
          is_active: { _eq: true }
        }) { id }
      }
    `, { wfId: workflow_id });

    if (!triggerData?.workflow_triggers?.length) {
      return res.status(200).json({ success: false, message: 'Webhook not enabled' });
    }

    // 3. Check quota
    const orgData = await graphqlRequest(`
      query GetOrg($id: uuid!) {
        organizations_by_pk(id: $id) { quota_used, quota_limit }
      }
    `, { id: workflow.org_id });

    const org = orgData?.organizations_by_pk;
    if (org && org.quota_used >= org.quota_limit) {
      return res.status(200).json({ success: false, message: 'Quota exceeded' });
    }

    // 4. Get steps
    const stepsData = await graphqlRequest(`
      query GetSteps($wfId: uuid!) {
        workflow_steps(where: { workflow_id: { _eq: $wfId } }, order_by: { order_index: asc }) {
          id, step_type, name, order_index
        }
      }
    `, { wfId: workflow_id });

    const steps = stepsData?.workflow_steps || [];
    if (steps.length === 0) {
      return res.status(200).json({ success: false, message: 'No steps' });
    }

    // 5. Create workflow_run
    const runData = await graphqlRequest(`
      mutation CreateRun($object: workflow_runs_insert_input!) {
        insert_workflow_runs_one(object: $object) { id }
      }
    `, {
      object: {
        workflow_id,
        workflow_version: workflow.current_version || 1,
        status: 'running',
        current_step_index: 0,
        execution_state: {},
        trigger_type: 'webhook',
        trigger_data: payload || {},
        started_at: new Date().toISOString(),
      }
    });

    const runId = runData?.insert_workflow_runs_one?.id;
    if (!runId) {
      return res.status(200).json({ success: false, message: 'Failed to create run' });
    }

    // 6. Create step_runs
    const stepRuns = steps.map(s => ({
      workflow_run_id: runId,
      step_id: s.id,
      step_type: s.step_type,
      order_index: s.order_index,
      status: 'pending',
      attempt_count: 0,
      max_attempts: 3,
    }));

    await graphqlRequest(`
      mutation CreateStepRuns($objects: [step_runs_insert_input!]!) {
        insert_step_runs(objects: $objects) { affected_rows }
      }
    `, { objects: stepRuns });

    // 7. Execute steps (simplified)
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepRun = stepRuns[i];

      await graphqlRequest(`
        mutation UpdateStep($id: uuid!, $set: step_runs_set_input!) {
          update_step_runs_by_pk(pk_columns: { id: $id }, _set: $set) { id }
        }
      `, { id: stepRun.id, set: { status: 'running', started_at: new Date().toISOString() } });

      let output = { success: true, stubbed: true };
      let status = 'completed';

      if (step.step_type === 'approval_gate') {
        status = 'awaiting_approval';
        await graphqlRequest(`
          mutation Pause($id: uuid!) {
            update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: {
              status: 'paused', paused_at: $now
            }) { id }
          }
        `, { id: runId, now: new Date().toISOString() });
      }

      await graphqlRequest(`
        mutation UpdateStep($id: uuid!, $set: step_runs_set_input!) {
          update_step_runs_by_pk(pk_columns: { id: $id }, _set: $set) { id }
        }
      `, { id: stepRun.id, set: { status, output, completed_at: new Date().toISOString() } });

      if (status === 'awaiting_approval') break;
    }

    // 8. Complete if not paused
    const finalRun = await graphqlRequest(`
      query GetRun($id: uuid!) { workflow_runs_by_pk(id: $id) { status } }
    `, { id: runId });

    if (finalRun?.workflow_runs_by_pk?.status !== 'paused') {
      await graphqlRequest(`
        mutation Complete($id: uuid!, $now: timestamptz!) {
          update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: {
            status: 'completed', completed_at: $now
          }) { id }
        }
      `, { id: runId, now: new Date().toISOString() });
    }

    // 9. Increment quota
    await graphqlRequest(`
      mutation IncQuota($id: uuid!) {
        update_organizations_by_pk(pk_columns: { id: $id }, _inc: { quota_used: 1 }) { id }
      }
    `, { id: workflow.org_id });

    return res.status(200).json({ success: true, run_id: runId, message: 'Triggered via webhook' });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}
