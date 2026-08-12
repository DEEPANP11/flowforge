import { useEffect, useState } from 'react';
import { useNhostClient } from '@nhost/react';
import { useRouter } from 'next/router';
import StatusTimeline from '../../../components/RunView/StatusTimeline';
import ApproveButton from '../../../components/RunView/ApproveButton';
import { setNhostClient } from '../../../utils/workflowRunner';

interface StepRun {
  id: string;
  step_type: string;
  order_index: number;
  status: string;
  output: any;
  error_message: string;
  attempt_count: number;
  approved_by: string;
  started_at: string;
  completed_at: string;
}
interface WorkflowRun {
  id: string;
  status: string;
  current_step_index: number;
  started_at: string;
  completed_at: string;
  error_message: string;
  workflow: { id: string; name: string };
  step_runs: StepRun[];
}

export default function RunView() {
  const nhost = useNhostClient();
  const router = useRouter();
  const { id } = router.query;
  const [run, setRun] = useState<WorkflowRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const check = async () => {
      await nhost.auth.getSession();
      setNhostClient(nhost);
      setReady(true);
      if (!nhost.auth.isAuthenticated()) router.push('/login');
    };
    check();
  }, []);

  useEffect(() => {
    if (id && ready) loadRun();
  }, [id, ready]);

  useEffect(() => {
    if (!id || !ready || id === 'new') return;
    const token = nhost.auth.getAccessToken();
    if (!token) return;
    const wsUrl = nhost.graphql.wsUrl;
    const ws = new WebSocket(wsUrl, 'graphql-ws');
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'connection_init', payload: { headers: { Authorization: `Bearer ${token}` } } }));
      ws.send(JSON.stringify({ id: '1', type: 'subscribe', payload: { query: `subscription($id: uuid!) { workflow_runs_by_pk(id: $id) { id status current_step_index started_at completed_at error_message } }`, variables: { id } } }));
      ws.send(JSON.stringify({ id: '2', type: 'subscribe', payload: { query: `subscription($rid: uuid!) { step_runs(where: { workflow_run_id: { _eq: $rid } }, order_by: { order_index: asc }) { id step_type order_index status output error_message attempt_count approved_by started_at completed_at } }`, variables: { rid: id } } }));
    };
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'data') {
        if (msg.id === '1' && msg.payload?.data?.workflow_runs_by_pk) setRun((p) => (p ? { ...p, ...msg.payload.data.workflow_runs_by_pk } : null));
        if (msg.id === '2' && msg.payload?.data?.step_runs) setRun((p) => (p ? { ...p, step_runs: msg.payload.data.step_runs } : null));
      }
    };
    return () => {
      ws.close();
    };
  }, [id, ready]);

  async function gqlFetch(query: string, variables: any = {}) {
    const { data, error } = await nhost.graphql.request(query, variables);
    if (error) {
      console.error('GraphQL Error:', JSON.stringify(error, null, 2));
      throw new Error('GraphQL request failed');
    }
    return data;
  }

  async function loadRun() {
    setLoading(true);
    setError('');
    try {
      const data = await gqlFetch(
        `query($rid: uuid!) {
          workflow_runs_by_pk(id: $rid) {
            id status current_step_index started_at completed_at error_message workflow_id
          }
        }`,
        { rid: id }
      );
      const runData = data?.workflow_runs_by_pk;
      if (!runData) {
        setError('Run not found');
        return;
      }

      const wfData = await gqlFetch(`query($wid: uuid!) { workflows_by_pk(id: $wid) { id name } }`, { wid: runData.workflow_id });
      runData.workflow = wfData?.workflows_by_pk || { id: runData.workflow_id, name: 'Unknown' };

      const stepsData = await gqlFetch(
        `query($rid: uuid!) {
          step_runs(where: { workflow_run_id: { _eq: $rid } }, order_by: { order_index: asc }) {
            id step_type order_index status output error_message attempt_count approved_by started_at completed_at
          }
        }`,
        { rid: id }
      );
      runData.step_runs = stepsData?.step_runs || [];
      setRun(runData);
    } catch (e: any) {
      console.error('loadRun error:', e);
      setError(e.message || 'Failed to load run');
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(stepRunId: string, approved: boolean) {
    setApproving(true);
    try {
      const { data: srData } = await nhost.graphql.request(`query($id: uuid!) { step_runs_by_pk(id: $id) { id workflow_run_id order_index } }`, { id: stepRunId });
      const sr = srData?.step_runs_by_pk;
      if (!sr) throw new Error('Step run not found');

      if (approved) {
        await nhost.graphql.request(
          `mutation($id: uuid!, $uid: uuid!, $now: timestamptz!) {
            update_step_runs_by_pk(pk_columns: { id: $id }, _set: {
              status: completed, approved_by: $uid, approved_at: $now
            }) { id }
          }`,
          { id: stepRunId, uid: nhost.auth.getUser()?.id, now: new Date().toISOString() }
        );

        const nextIndex = sr.order_index + 1;
        await nhost.graphql.request(
          `mutation($id: uuid!, $idx: Int!) {
            update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: {
              status: running, current_step_index: $idx
            }) { id }
          }`,
          { id: sr.workflow_run_id, idx: nextIndex }
        );

        const runData = await nhost.graphql.request(`query($id: uuid!) { workflow_runs_by_pk(id: $id) { workflow_id } }`, { id: sr.workflow_run_id }) as any;
        const wfId = runData?.workflow_runs_by_pk?.workflow_id;

        const stepsData = await nhost.graphql.request(
          `query($wid: uuid!, $idx: Int!) {
            workflow_steps(where: { workflow_id: { _eq: $wid }, order_index: { _gte: $idx } }, order_by: { order_index: asc }) {
              id step_type name order_index config
            }
          }`,
          { wid: wfId, idx: nextIndex }
        );
        const remainingSteps = (stepsData as any)?.workflow_steps || [];

        for (let i = 0; i < remainingSteps.length; i++) {
          const step = remainingSteps[i];
          const stEnum = step.step_type;
          const newSr = await nhost.graphql.request(
            `mutation($rid: uuid!, $sid: uuid!, $idx: Int!, $now: timestamptz!) {
              insert_step_runs_one(object: {
                workflow_run_id: $rid, step_id: $sid, step_type: ${stEnum},
                order_index: $idx, status: "running", attempt_count: 1,
                max_attempts: 3, started_at: $now
              }) { id }
            }`,
            { rid: sr.workflow_run_id, sid: step.id, idx: nextIndex + i, now: new Date().toISOString() }
          );
          const newSrId = (newSr as any)?.insert_step_runs_one?.id;
          if (!newSrId) continue;

          let output: any = { success: true, stubbed: true };
          let stepStatus = 'completed';

          if (step.step_type === 'approval_gate') {
            stepStatus = 'awaiting_approval';
            output = { message: step.config?.message || 'Approval required' };
            await nhost.graphql.request(
              `mutation($id: uuid!, $now: timestamptz!) {
                update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: {
                  status: paused, paused_at: $now
                }) { id }
              }`,
              { id: sr.workflow_run_id, now: new Date().toISOString() }
            );
          }

          await nhost.graphql.request(
            `mutation($id: uuid!, $output: jsonb!, $now: timestamptz!) {
              update_step_runs_by_pk(pk_columns: { id: $id }, _set: {
                status: ${stepStatus}, output: $output, completed_at: $now
              }) { id }
            }`,
            { id: newSrId, output, now: new Date().toISOString() }
          );

          if (stepStatus === 'awaiting_approval') break;
        }

        const finalRun = await nhost.graphql.request(`query($id: uuid!) { workflow_runs_by_pk(id: $id) { status } }`, { id: sr.workflow_run_id }) as any;
        if (finalRun?.workflow_runs_by_pk?.status !== 'paused') {
          await nhost.graphql.request(
            `mutation($id: uuid!, $now: timestamptz!) {
              update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: {
                status: completed, completed_at: $now
              }) { id }
            }`,
            { id: sr.workflow_run_id, now: new Date().toISOString() }
          );
        }
      } else {
        await nhost.graphql.request(
          `mutation($id: uuid!) {
            update_step_runs_by_pk(pk_columns: { id: $id }, _set: {
              status: failed, error_message: "Rejected by user"
            }) { id }
          }`,
          { id: stepRunId }
        );
        await nhost.graphql.request(
          `mutation($id: uuid!) {
            update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: {
              status: failed, error_message: "Approval rejected"
            }) { id }
          }`,
          { id: sr.workflow_run_id }
        );
      }

      await loadRun();
    } catch (e: any) {
      console.error('Approve error:', e);
      alert('Failed: ' + (e.message || 'Unknown error'));
    } finally {
      setApproving(false);
    }
  }

  function statusStyle(s: string) {
    if (s === 'completed') return { background: '#ecfdf5', color: '#059669' };
    if (s === 'running') return { background: '#eff6ff', color: '#2563eb' };
    if (s === 'failed') return { background: '#fef2f2', color: '#dc2626' };
    if (s === 'paused' || s === 'awaiting_approval') return { background: '#fffbeb', color: '#d97706' };
    return { background: '#f1f5f9', color: '#64748b' };
  }

  if (loading || !ready) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9' }}>
        <div style={{ width: 40, height: 40, border: '4px solid #e2e8f0', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9' }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: '#dc2626', marginBottom: 8 }}>Error</h2>
          <p style={{ color: '#64748b', marginBottom: 20 }}>{error}</p>
          <button onClick={() => router.push('/')} style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#334155', fontSize: 13, cursor: 'pointer' }}>
            ← Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!run) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9' }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: '#0f172a' }}>Run not found</h2>
          <button onClick={() => router.push('/')} style={{ marginTop: 16, padding: '8px 20px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#334155', fontSize: 13, cursor: 'pointer' }}>
            ← Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      <header style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button onClick={() => router.push('/')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#64748b' }}>
              ← Back
            </button>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', margin: 0 }}>{run.workflow?.name}</h1>
              <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>Run #{run.id.slice(0, 8)}</p>
            </div>
          </div>
          <span style={{ fontSize: 12, fontWeight: 500, padding: '4px 12px', borderRadius: 20, ...statusStyle(run.status) }}>{run.status}</span>
        </div>
      </header>
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '24px' }}>
        {run.error_message && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: 12, borderRadius: 8, marginBottom: 20, fontSize: 13 }}>
            {run.error_message}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20 }}>
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', margin: '0 0 16px' }}>Step Progress</h2>
            <StatusTimeline stepRuns={run.step_runs || []} currentStepIndex={run.current_step_index} onApprove={handleApprove} approving={approving} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {run.status === 'paused' && run.step_runs?.some((sr) => sr.status === 'awaiting_approval') && (
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: 20 }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: '#92400e', margin: '0 0 12px' }}>Approval Required</h3>
                <ApproveButton stepRun={run.step_runs.find((sr) => sr.status === 'awaiting_approval')!} onApprove={handleApprove} approving={approving} />
              </div>
            )}
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', margin: '0 0 12px' }}>Run Info</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Status</span>
                  <span style={{ fontWeight: 500 }}>{run.status}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Total Steps</span>
                  <span style={{ fontWeight: 500 }}>{run.step_runs?.length || 0}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Completed</span>
                  <span style={{ fontWeight: 500, color: '#059669' }}>{run.step_runs?.filter((sr) => sr.status === 'completed').length || 0}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
