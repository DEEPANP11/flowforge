import { useEffect, useState } from 'react';
import { useNhostClient } from '@nhost/react';
import { useRouter } from 'next/router';

interface Workflow {
  id: string;
  name: string;
  description: string;
  status: string;
  step_count?: number;
  last_run_status?: string;
}
interface Membership {
  org_id: string;
  role: string;
  organization: { id: string; name: string };
}
interface Quota {
  quota_limit: number;
  quota_used: number;
}

export default function Dashboard() {
  const nhost = useNhostClient();
  const router = useRouter();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const check = async () => {
      await nhost.auth.getSession();
      setReady(true);
      if (!nhost.auth.isAuthenticated()) router.push('/login');
    };
    check();
  }, []);

  useEffect(() => {
    if (ready && nhost.auth.getUser()) loadMemberships();
  }, [ready]);

  useEffect(() => {
    if (selectedOrg) {
      loadWorkflows();
      loadQuota();
    }
  }, [selectedOrg]);

  async function gqlFetch(query: string, variables: any = {}) {
    const { data, error } = await nhost.graphql.request(query, variables);
    if (error) {
      console.error('GraphQL Error:', JSON.stringify(error, null, 2));
      throw new Error('GraphQL request failed');
    }
    return data;
  }

  async function loadMemberships() {
    try {
      const user = nhost.auth.getUser();
      const data = await gqlFetch(
        `query($uid: uuid!) {
          org_members(where: { user_id: { _eq: $uid } }) {
            org_id role
            organization { id name }
          }
        }`,
        { uid: user?.id }
      );
      const m = data?.org_members || [];
      setMemberships(m);
      if (m.length > 0 && !selectedOrg) setSelectedOrg(m[0].org_id);
    } catch (e) {
      console.error('loadMemberships error:', e);
    }
  }

  async function loadWorkflows() {
    if (!selectedOrg) return;
    setLoading(true);
    try {
      const data = await gqlFetch(
        `query($oid: uuid!) {
          workflows(where: { org_id: { _eq: $oid }, deleted_at: { _is_null: true } }, order_by: { created_at: desc }) {
            id name description status
          }
        }`,
        { oid: selectedOrg }
      );
      const wfs = data?.workflows || [];

      for (const wf of wfs) {
        try {
          const stepsData = await gqlFetch(
            `query($wid: uuid!) { workflow_steps(where: { workflow_id: { _eq: $wid } }) { id } }`,
            { wid: wf.id }
          );
          wf.step_count = stepsData?.workflow_steps?.length || 0;
        } catch {
          wf.step_count = 0;
        }

        try {
          const runsData = await gqlFetch(
            `query($wid: uuid!) { workflow_runs(where: { workflow_id: { _eq: $wid } }, order_by: { created_at: desc }, limit: 1) { id status } }`,
            { wid: wf.id }
          );
          wf.last_run_status = runsData?.workflow_runs?.[0]?.status || 'Never';
        } catch {
          wf.last_run_status = 'Never';
        }
      }
      setWorkflows(wfs);
    } catch (e) {
      console.error('loadWorkflows error:', e);
    } finally {
      setLoading(false);
    }
  }

  async function loadQuota() {
    if (!selectedOrg) return;
    try {
      const data = await gqlFetch(
        `query($oid: uuid!) { organizations_by_pk(id: $oid) { quota_limit quota_used } }`,
        { oid: selectedOrg }
      );
      setQuota(data?.organizations_by_pk);
    } catch (e) {
      console.error('loadQuota error:', e);
    }
  }

  async function deleteWorkflow(id: string) {
    if (!confirm('Delete this workflow?')) return;
    try {
      await gqlFetch(`mutation($id: uuid!) { update_workflows_by_pk(pk_columns: {id: $id}, _set: {deleted_at: "now()"}) { id } }`, { id });
      setWorkflows((prev) => prev.filter((wf) => wf.id !== id));
    } catch (e) {
      alert('Failed to delete workflow');
    }
  }

  function statusColor(s: string) {
    if (s === 'completed') return 'bg-emerald-100 text-emerald-700';
    if (s === 'running') return 'bg-blue-100 text-blue-700';
    if (s === 'failed') return 'bg-red-100 text-red-700';
    if (s === 'paused') return 'bg-amber-100 text-amber-700';
    return 'bg-gray-100 text-gray-500';
  }

  if (!ready) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
        <div style={{ width: 40, height: 40, border: '4px solid #e2e8f0', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    );
  }

  const user = nhost.auth.getUser();

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      {/* Header */}
      <header style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, background: 'linear-gradient(135deg, #3b82f6, #2563eb)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: '#fff', fontSize: 18, fontWeight: 700 }}>⚡</span>
            </div>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>FlowForge</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <select
              value={selectedOrg || ''}
              onChange={(e) => setSelectedOrg(e.target.value)}
              style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, background: '#fff', color: '#334155' }}
            >
              {memberships.map((m) => (
                <option key={m.org_id} value={m.org_id}>
                  {m.organization.name} ({m.role})
                </option>
              ))}
            </select>
            {quota && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <span style={{ color: '#94a3b8' }}>Quota</span>
                <div style={{ width: 80, height: 6, background: '#e2e8f0', borderRadius: 3 }}>
                  <div style={{ height: 6, background: '#3b82f6', borderRadius: 3, width: `${Math.min((quota.quota_used / quota.quota_limit) * 100, 100)}%` }} />
                </div>
                <span style={{ color: '#64748b', fontWeight: 500 }}>{quota.quota_used}/{quota.quota_limit}</span>
              </div>
            )}
            <span style={{ fontSize: 13, color: '#64748b', background: '#f1f5f9', padding: '4px 12px', borderRadius: 20 }}>{user?.email}</span>
            <button onClick={async () => { await nhost.auth.signOut(); router.push('/login'); }} style={{ fontSize: 13, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }}>
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', margin: 0 }}>Workflows</h2>
            <p style={{ color: '#64748b', marginTop: 4, fontSize: 14 }}>Manage and automate your AI workflows</p>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={() => router.push('/templates')} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#334155', fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              📦 Templates
            </button>
            <button onClick={() => router.push('/history')} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#334155', fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              📊 History
            </button>
            <button onClick={() => router.push('/credentials')} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#334155', fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              🔑 Credentials
            </button>
            <button onClick={() => router.push('/workflow/new')} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              + New Workflow
            </button>
          </div>
        </div>

        {/* Workflow Cards */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 80 }}>
            <div style={{ width: 40, height: 40, border: '4px solid #e2e8f0', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
            <p style={{ marginTop: 16, color: '#94a3b8' }}>Loading workflows...</p>
          </div>
        ) : workflows.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 12, padding: 64, textAlign: 'center', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', margin: '0 0 8px' }}>No workflows yet</h3>
            <p style={{ color: '#64748b', marginBottom: 24 }}>Create your first workflow to get started with AI automation</p>
            <button onClick={() => router.push('/workflow/new')} style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
              Create Your First Workflow
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
            {workflows.map((wf) => (
              <div key={wf.id} style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e2e8f0', transition: 'box-shadow 0.2s', cursor: 'default' }}
                onMouseEnter={(e) => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)')}
                onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'none')}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', margin: 0 }}>{wf.name}</h3>
                  <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 12, ...(() => {
                    const c = statusColor(wf.status);
                    return {};
                  })() }}>
                    {wf.status}
                  </span>
                </div>
                {wf.description && <p style={{ fontSize: 13, color: '#64748b', marginBottom: 12, lineHeight: 1.5 }}>{wf.description}</p>}
                <div style={{ display: 'flex', gap: 16, fontSize: 13, color: '#94a3b8', marginBottom: 16 }}>
                  <span>📝 {wf.step_count || 0} steps</span>
                  <span>
                    {wf.last_run_status === 'completed' && '✅'}
                    {wf.last_run_status === 'failed' && '❌'}
                    {wf.last_run_status === 'running' && '⏳'}
                    {!['completed', 'failed', 'running'].includes(wf.last_run_status || '') && '⬜'}{' '}
                    {wf.last_run_status || 'Never run'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => router.push(`/workflow/${wf.id}`)}
                    style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#334155', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
                  >
                    Open Editor →
                  </button>
                  <button
                    onClick={() => deleteWorkflow(wf.id)}
                    style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
                  >
                    🗑
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
