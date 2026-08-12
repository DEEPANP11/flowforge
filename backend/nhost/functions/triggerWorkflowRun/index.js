// triggerWorkflowRun - Paste this into nhost Functions → triggerWorkflowRun

const NHOST_GRAPHQL_URL = process.env.NHOST_GRAPHQL_URL;
const HASURA_ADMIN_SECRET = process.env.HASURA_ADMIN_SECRET;

async function gql(query, variables = {}) {
  const r = await fetch(NHOST_GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-hasura-admin-secret': HASURA_ADMIN_SECRET },
    body: JSON.stringify({ query, variables }),
  });
  return (await r.json()).data;
}

export default async function triggerWorkflowRun(req, res) {
  const { session_variables, input } = req.body;
  const userId = session_variables['x-hasura-user-id'];
  const { workflow_id } = input;

  try {
    const workflowData = await gql(`
      query($id: uuid!) {
        workflows_by_pk(id: $id) { id org_id name status deleted_at current_version }
      }
    `, { id: workflow_id });

    const workflow = workflowData?.workflows_by_pk;
    if (!workflow || workflow.deleted_at) return res.status(200).json({ success: false, message: 'Workflow not found' });

    const memberData = await gql(`
      query($uid: uuid!, $oid: uuid!) {
        org_members(where: { user_id: { _eq: $uid }, org_id: { _eq: $oid } }) { role }
      }
    `, { userId, oid: workflow.org_id });

    const role = memberData?.org_members?.[0]?.role;
    if (!role || (role !== 'owner' && role !== 'editor')) {
      return res.status(200).json({ success: false, message: 'Not authorized' });
    }

    const orgData = await gql(`query($id: uuid!) { organizations_by_pk(id: $id) { quota_used quota_limit } }`, { id: workflow.org_id });
    if (orgData?.organizations_by_pk?.quota_used >= orgData?.organizations_by_pk?.quota_limit) {
      return res.status(200).json({ success: false, message: 'Quota exceeded' });
    }

    const stepsData = await gql(`
      query($wid: uuid!) {
        workflow_steps(where: { workflow_id: { _eq: $wid } }, order_by: { order_index: asc }) {
          id step_type name order_index config
        }
      }
    `, { wid: workflow_id });

    const steps = stepsData?.workflow_steps || [];
    if (steps.length === 0) return res.status(200).json({ success: false, message: 'No steps' });

    const runData = await gql(`
      mutation($wfId: uuid!, $ver: Int!, $td: jsonb!) {
        insert_workflow_runs_one(object: {
          workflow_id: $wfId, workflow_version: $ver, status: "running",
          current_step_index: 0, execution_state: {}, trigger_type: "manual",
          trigger_data: $td, started_at: $now
        }) { id }
      }
    `, { wfId: workflow_id, ver: workflow.current_version || 1, td: { user_id: userId }, now: new Date().toISOString() });

    const runId = runData?.insert_workflow_runs_one?.id;
    if (!runId) return res.status(200).json({ success: false, message: 'Failed to create run' });

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const srData = await gql(`
        mutation($rid: uuid!, $sid: uuid!, $st: String!, $idx: Int!) {
          insert_step_runs_one(object: {
            workflow_run_id: $rid, step_id: $sid, step_type: $st,
            order_index: $idx, status: "running", attempt_count: 0,
            max_attempts: 3, started_at: $now
          }) { id }
        }
      `, { rid: runId, sid: step.id, st: step.step_type, idx: step.order_index, now: new Date().toISOString() });

      const srId = srData?.insert_step_runs_one?.id;
      if (!srId) continue;

      let output = { success: true, stubbed: true };
      let status = 'completed';

      if (step.step_type === 'approval_gate') {
        status = 'awaiting_approval';
        output = { message: step.config?.message || 'Approval required', required_role: step.config?.required_role };
        await gql(`mutation($id: uuid!, $now: timestamptz!) {
          update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: {
            status: "paused", paused_at: $now, current_step_index: $idx
          }) { id }
        }`, { id: runId, now: new Date().toISOString(), idx: i });
      }

      await gql(`mutation($id: uuid!, $status: String!, $output: jsonb!, $now: timestamptz!) {
        update_step_runs_by_pk(pk_columns: { id: $id }, _set: {
          status: $status, output: $output, completed_at: $now
        }) { id }
      }`, { id: srId, status, output, now: new Date().toISOString() });

      if (status === 'awaiting_approval') break;
    }

    const finalRun = await gql(`query($id: uuid!) { workflow_runs_by_pk(id: $id) { status } }`, { id: runId });
    if (finalRun?.workflow_runs_by_pk?.status !== 'paused') {
      await gql(`mutation($id: uuid!, $now: timestamptz!) {
        update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: {
          status: "completed", completed_at: $now
        }) { id }
      }`, { id: runId, now: new Date().toISOString() });
    }

    await gql(`mutation($id: uuid!) {
      update_organizations_by_pk(pk_columns: { id: $id }, _inc: { quota_used: 1 }) { id }
    }`, { id: workflow.org_id });

    return res.status(200).json({ success: true, run_id: runId, message: 'Workflow triggered' });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}
