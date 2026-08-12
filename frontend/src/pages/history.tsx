import { useEffect, useState } from 'react';
import { useNhostClient } from '@nhost/react';
import { useRouter } from 'next/router';

interface WorkflowRun {
  id: string;
  status: string;
  trigger_type: string;
  started_at: string;
  completed_at: string;
  workflow: { id: string; name: string };
}

export default function ExecutionHistory() {
  const nhost = useNhostClient();
  const router = useRouter();
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    const check = async () => {
      await nhost.auth.getSession();
      setReady(true);
      if (!nhost.auth.isAuthenticated()) router.push('/login');
    };
    check();
  }, []);

  useEffect(() => {
    if (ready && nhost.auth.getUser()) loadRuns();
  }, [ready, statusFilter]);

  async function gqlFetch(query: string, variables: any = {}) {
    const { data, error } = await nhost.graphql.request(query, variables);
    if (error) throw new Error('GraphQL request failed');
    return data;
  }

  async function loadRuns() {
    setLoading(true);
    try {
      const user = nhost.auth.getUser();
      if (!user) return;

      const membershipData = await gqlFetch(
        `query($uid: uuid!) { org_members(where: { user_id: { _eq: $uid } }, limit: 1) { org_id } }`,
        { uid: user.id }
      );
      const oid = membershipData?.org_members?.[0]?.org_id;
      if (!oid) return;

      const statusClause = statusFilter !== 'all' ? `, status: { _eq: "${statusFilter}" }` : '';
      const runsData = await gqlFetch(
        `query($oid: uuid!) {
          workflow_runs(where: { workflow: { org_id: { _eq: $oid }${statusClause} } }, order_by: { created_at: desc }, limit: 50) {
            id status trigger_type started_at completed_at created_at
            workflow { id name }
          }
        }`,
        { oid }
      );
      setRuns(runsData?.workflow_runs || []);
    } catch (e) {
      console.error('loadRuns error:', e);
    } finally {
      setLoading(false);
    }
  }

  function statusStyle(s: string) {
    if (s === 'completed') return { background: '#ecfdf5', color: '#059669' };
    if (s === 'running') return { background: '#eff6ff', color: '#2563eb' };
    if (s === 'failed') return { background: '#fef2f2', color: '#dc2626' };
    if (s === 'paused') return { background: '#fffbeb', color: '#d97706' };
    return { background: '#f1f5f9', color: '#64748b' };
  }

  function timeAgo(date: string) {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }

  function duration(start: string, end: string) {
    if (!end) return '—';
    const ms = new Date(end).getTime() - new Date(start).getTime();
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      <header style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={() => router.push('/')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#64748b' }}>
            ← Back
          </button>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', margin: 0 }}>Execution History</h1>
        </div>
      </header>
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <label style={{ fontSize: 13, color: '#64748b' }}>Filter:</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, background: '#fff' }}>
            <option value="all">All</option>
            <option value="completed">Completed</option>
            <option value="running">Running</option>
            <option value="failed">Failed</option>
            <option value="paused">Paused</option>
          </select>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 80 }}>
            <div style={{ width: 40, height: 40, border: '4px solid #e2e8f0', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
          </div>
        ) : runs.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 12, padding: 64, textAlign: 'center', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', margin: '0 0 8px' }}>No executions yet</h3>
            <p style={{ color: '#64748b' }}>Run a workflow to see execution history here</p>
          </div>
        ) : (
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Workflow</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Status</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Trigger</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Duration</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Started</th>
                  <th style={{ padding: '12px 16px' }}></th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{run.workflow?.name || 'Unknown'}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 12, ...statusStyle(run.status) }}>{run.status}</span>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#64748b', textTransform: 'capitalize' }}>{run.trigger_type}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#64748b' }}>{duration(run.started_at, run.completed_at)}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#94a3b8' }}>{timeAgo(run.started_at)}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <button onClick={() => router.push(`/workflow/run/${run.id}`)} style={{ color: '#3b82f6', background: 'none', border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
