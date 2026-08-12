// approveStep - Paste this into nhost Functions → approveStep

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

export default async function approveStep(req, res) {
  const { session_variables, input } = req.body;
  const userId = session_variables['x-hasura-user-id'];
  const { step_run_id, approved } = input;

  try {
    const stepData = await gql(`
      query($id: uuid!) {
        step_runs_by_pk(id: $id) {
          id step_type status workflow_run_id order_index
        }
      }
    `, { id: step_run_id });

    const stepRun = stepData?.step_runs_by_pk;
    if (!stepRun) return res.status(200).json({ success: false, message: 'Step not found' });
    if (stepRun.status !== 'awaiting_approval') return res.status(200).json({ success: false, message: 'Not awaiting approval' });

    const runData = await gql(`
      query($rid: uuid!) {
        workflow_runs_by_pk(id: $rid) {
          id status current_step_index workflow_id
        }
      }
    `, { rid: stepRun.workflow_run_id });

    const run = runData?.workflow_runs_by_pk;
    if (!run) return res.status(200).json({ success: false, message: 'Run not found' });

    const wfData = await gql(`
      query($wid: uuid!) {
        workflows_by_pk(id: $wid) { id org_id }
      }
    `, { wid: run.workflow_id });

    const orgId = wfData?.workflows_by_pk?.org_id;

    const memberData = await gql(`
      query($uid: uuid!, $oid: uuid!) {
        org_members(where: { user_id: { _eq: $uid }, org_id: { _eq: $oid } }) { role }
      }
    `, { userId, oid: orgId });

    const role = memberData?.org_members?.[0]?.role;
    if (!role || (role !== 'owner' && role !== 'editor')) {
      return res.status(200).json({ success: false, message: 'Not authorized' });
    }

    if (approved) {
      await gql(`mutation($id: uuid!, $uid: uuid!, $now: timestamptz!) {
        update_step_runs_by_pk(pk_columns: { id: $id }, _set: {
          status: "completed", approved_by: $uid, approved_at: $now
        }) { id }
      }`, { id: step_run_id, uid: userId, now: new Date().toISOString() });

      const nextIndex = run.current_step_index + 1;

      await gql(`mutation($id: uuid!, $idx: Int!) {
        update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: {
          status: "running", current_step_index: $idx
        }) { id }
      }`, { id: run.id, idx: nextIndex });

      const remainingSteps = await gql(`
        query($wid: uuid!, $idx: Int!) {
          workflow_steps(where: { workflow_id: { _eq: $wid }, order_index: { _gte: $idx } }, order_by: { order_index: asc }) {
            id step_type name order_index config
          }
        }
      `, { wid: run.workflow_id, idx: nextIndex });

      const stepsToRun = remainingSteps?.workflow_steps || [];

      for (let i = 0; i < stepsToRun.length; i++) {
        const step = stepsToRun[i];
        const srData = await gql(`
          query($rid: uuid!, $sid: uuid!) {
            step_runs(where: { workflow_run_id: { _eq: $rid }, step_id: { _eq: $sid } }) { id }
          }
        `, { rid: run.id, sid: step.id });
        const sr = srData?.step_runs?.[0];
        if (!sr) continue;

        await gql(`mutation($id: uuid!) {
          update_step_runs_by_pk(pk_columns: { id: $id }, _set: {
            status: "running", started_at: $now
          }) { id }
        }`, { id: sr.id, now: new Date().toISOString() });

        let output = { success: true, stubbed: true };
        let status = 'completed';

        if (step.step_type === 'approval_gate') {
          status = 'awaiting_approval';
          output = { message: step.config?.message || 'Approval required', required_role: step.config?.required_role };
          await gql(`mutation($id: uuid!, $now: timestamptz!) {
            update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: {
              status: "paused", paused_at: $now
            }) { id }
          }`, { id: run.id, now: new Date().toISOString() });
        }

        await gql(`mutation($id: uuid!, $status: String!, $output: jsonb!, $now: timestamptz!) {
          update_step_runs_by_pk(pk_columns: { id: $id }, _set: {
            status: $status, output: $output, completed_at: $now
          }) { id }
        }`, { id: sr.id, status, output, now: new Date().toISOString() });

        if (status === 'awaiting_approval') break;
      }

      const finalRun = await gql(`query($id: uuid!) { workflow_runs_by_pk(id: $id) { status } }`, { id: run.id });
      if (finalRun?.workflow_runs_by_pk?.status !== 'paused') {
        await gql(`mutation($id: uuid!, $now: timestamptz!) {
          update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: {
            status: "completed", completed_at: $now
          }) { id }
        }`, { id: run.id, now: new Date().toISOString() });
      }

      return res.status(200).json({ success: true, message: 'Approved and resumed' });
    } else {
      await gql(`mutation($id: uuid!) {
        update_step_runs_by_pk(pk_columns: { id: $id }, _set: {
          status: "failed", error_message: "Rejected by user"
        }) { id }
      }`, { id: step_run_id });

      await gql(`mutation($id: uuid!) {
        update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: {
          status: "failed", error_message: "Approval rejected"
        }) { id }
      }`, { id: run.id });

      return res.status(200).json({ success: true, message: 'Rejected' });
    }
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}
