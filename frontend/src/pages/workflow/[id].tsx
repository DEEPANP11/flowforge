import { useEffect, useState } from 'react';
import { useNhostClient } from '@nhost/react';
import { useRouter } from 'next/router';
import StepList from '../../components/WorkflowBuilder/StepList';
import StepConfig from '../../components/WorkflowBuilder/StepConfig';
import { setNhostClient, triggerWorkflowRun } from '../../utils/workflowRunner';

interface Step {
  id?: string;
  step_type: string;
  name: string;
  config: any;
  order_index: number;
}
interface Workflow {
  id: string;
  name: string;
  description: string;
  status: string;
  current_version: number;
  steps: Step[];
}

const STEP_TYPES = [
  { type: 'llm_call', label: 'LLM Call', icon: '🤖' },
  { type: 'http_request', label: 'HTTP Request', icon: '🌐' },
  { type: 'db_write', label: 'DB Write', icon: '💾' },
  { type: 'notify', label: 'Notify', icon: '🔔' },
  { type: 'conditional_branch', label: 'Conditional', icon: '🔀' },
  { type: 'approval_gate', label: 'Approval', icon: '✅' },
];

export default function WorkflowEditor() {
  const nhost = useNhostClient();
  const router = useRouter();
  const { id } = router.query;
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [selectedStep, setSelectedStep] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [userRole, setUserRole] = useState<string>('viewer');

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
    if (id && ready) loadWorkflow();
  }, [id, ready]);

  async function gqlFetch(query: string, variables: any = {}) {
    const { data, error } = await nhost.graphql.request(query, variables);
    if (error) {
      console.error('GraphQL Error:', JSON.stringify(error, null, 2));
      let msg = 'GraphQL request failed';
      try {
        if (Array.isArray(error) && error.length > 0) {
          msg = (error[0] as any)?.message || JSON.stringify(error[0]);
        } else if (error && typeof error === 'object') {
          msg = (error as any).message || JSON.stringify(error);
        }
      } catch { msg = String(error); }
      throw new Error(msg);
    }
    return data;
  }

  async function loadWorkflow() {
    setLoading(true);
    setError('');
    try {
      if (id === 'new') {
        const user = nhost.auth.getUser();
        if (!user) {
          setError('Not authenticated');
          return;
        }

        const membershipData = await gqlFetch(
          `query($uid: uuid!) { org_members(where: { user_id: { _eq: $uid } }, limit: 1) { org_id role } }`,
          { uid: user.id }
        );
        const m = membershipData?.org_members?.[0];
        const orgId = m?.org_id;
        setUserRole(m?.role || 'viewer');
        if (!orgId) {
          setError('No organization found. Please create an org first.');
          return;
        }

        const insertData = await gqlFetch(
          `mutation($oid: uuid!, $uid: uuid!) {
            insert_workflows_one(object: {
              org_id: $oid,
              name: "New Workflow",
              description: "",
              created_by: $uid
            }) { id }
          }`,
          { oid: orgId, uid: user.id }
        );
        const newId = insertData?.insert_workflows_one?.id;
        if (!newId) {
          setError('Failed to create workflow.');
          return;
        }
        router.replace(`/workflow/${newId}`);
        return;
      }

      const data = await gqlFetch(
        `query($wid: uuid!) {
          workflows_by_pk(id: $wid) {
            id name description status current_version org_id
          }
        }`,
        { wid: id }
      );
      const wf = data?.workflows_by_pk;
      if (wf) {
        setWorkflow(wf);

        // Load user role for this org
        const user = nhost.auth.getUser();
        if (user) {
          const roleData = await gqlFetch(
            `query($uid: uuid!, $oid: uuid!) { org_members(where: { user_id: { _eq: $uid }, org_id: { _eq: $oid } }, limit: 1) { role } }`,
            { uid: user.id, oid: wf.org_id }
          );
          setUserRole(roleData?.org_members?.[0]?.role || 'viewer');
        }

        // Load steps
        const stepsData = await gqlFetch(
          `query($wid: uuid!) {
            workflow_steps(where: { workflow_id: { _eq: $wid } }, order_by: { order_index: asc }) {
              id step_type name config order_index
            }
          }`,
          { wid: wf.id }
        );
        setSteps(stepsData?.workflow_steps || []);
      }
    } catch (e: any) {
      console.error('loadWorkflow error:', e);
      setError(e.message || 'Failed to load workflow');
    } finally {
      setLoading(false);
    }
  }

  async function saveWorkflow() {
    if (!workflow) return;
    setSaving(true);
    setError('');
    try {
      await gqlFetch(
        `mutation($wid: uuid!, $name: String!, $desc: String!) {
          update_workflows_by_pk(pk_columns: { id: $wid }, _set: { name: $name, description: $desc }) { id }
        }`,
        { wid: workflow.id, name: workflow.name, desc: workflow.description }
      );

      // Save steps
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        if (s.id) {
          await gqlFetch(
            `mutation($sid: uuid!, $name: String!, $cfg: jsonb!, $idx: Int!) {
              update_workflow_steps_by_pk(pk_columns: { id: $sid }, _set: { name: $name, config: $cfg, order_index: $idx }) { id }
            }`,
            { sid: s.id, name: s.name, cfg: s.config, idx: i }
          );
        } else {
          const stEnum = s.step_type;
          const stepResult = await gqlFetch(
            `mutation($wid: uuid!, $name: String!, $cfg: jsonb!, $idx: Int!) {
              insert_workflow_steps_one(object: {
                workflow_id: $wid, step_type: ${stEnum}, name: $name, config: $cfg, order_index: $idx
              }) { id }
            }`,
            { wid: workflow.id, name: s.name, cfg: s.config, idx: i }
          );
          if (stepResult?.insert_workflow_steps_one?.id) {
            s.id = stepResult.insert_workflow_steps_one.id;
          }
        }
      }

      await loadWorkflow();
    } catch (e: any) {
      console.error('Save error:', e);
      setError(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function runWorkflow() {
    if (!workflow) return;
    setRunning(true);
    setError('');
    try {
      const result = await triggerWorkflowRun(workflow.id);
      if (result.success && result.runId) {
        router.push(`/workflow/run/${result.runId}`);
      } else {
        setError(result.error || 'Failed to start run');
      }
    } catch (e: any) {
      console.error('Run error:', e);
      setError(e.message || 'Failed to start run');
    } finally {
      setRunning(false);
    }
  }

  function addStep(type: string) {
    const configs: Record<string, any> = {
      llm_call: { provider: 'groq', model: '', prompt: '' },
      http_request: { method: 'GET', url: 'https://jsonplaceholder.typicode.com/posts/1', headers: {}, body: {} },
      db_write: { operation: 'insert', table: 'execution_logs', columns: { event_type: 'workflow_event', event_data: {} } },
      notify: { channel: 'slack', message_template: '' },
      conditional_branch: { condition: { left: '', operator: 'contains', right: '' } },
      approval_gate: { required_role: 'editor', message: '' },
    };
    setSteps([...steps, { step_type: type, name: `Step ${steps.length + 1}`, config: configs[type] || {}, order_index: steps.length }]);
    setShowAddMenu(false);
    setSelectedStep(steps.length);
  }

  function updateStep(index: number, updates: Partial<Step>) {
    const newSteps = [...steps];
    newSteps[index] = { ...newSteps[index], ...updates };
    setSteps(newSteps);
  }

  function removeStep(index: number) {
    setSteps(steps.filter((_, i) => i !== index));
    if (selectedStep === index) setSelectedStep(null);
  }

  function moveStep(from: number, to: number) {
    if (to < 0 || to >= steps.length) return;
    const newSteps = [...steps];
    const [moved] = newSteps.splice(from, 1);
    newSteps.splice(to, 0, moved);
    newSteps.forEach((s, i) => (s.order_index = i));
    setSteps(newSteps);
    if (selectedStep === from) setSelectedStep(to);
    else if (selectedStep !== null && selectedStep >= Math.min(from, to) && selectedStep <= Math.max(from, to)) {
      setSelectedStep(from < to ? selectedStep - 1 : selectedStep + 1);
    }
  }

  if (loading || !ready) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9' }}>
        <div style={{ width: 40, height: 40, border: '4px solid #e2e8f0', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    );
  }

  if (error && !workflow) {
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

  if (!workflow) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9' }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: '#0f172a' }}>Workflow not found</h2>
          <button onClick={() => router.push('/')} style={{ marginTop: 16, padding: '8px 20px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#334155', fontSize: 13, cursor: 'pointer' }}>
            ← Back
          </button>
        </div>
      </div>
    );
  }

  const stepTypeOf = (type: string) => STEP_TYPES.find((t) => t.type === type);
  const canRun = userRole === 'owner' || userRole === 'editor';

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      {/* Header */}
      <header style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button onClick={() => router.push('/')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#64748b' }}>
              ← Back
            </button>
            <input
              value={workflow.name}
              onChange={(e) => setWorkflow({ ...workflow, name: e.target.value })}
              style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', border: 'none', borderBottom: '2px solid transparent', outline: 'none', background: 'transparent', padding: '4px 0' }}
              onFocus={(e) => (e.target.style.borderBottomColor = '#3b82f6')}
              onBlur={(e) => (e.target.style.borderBottomColor = 'transparent')}
            />
            <span style={{ fontSize: 11, color: '#94a3b8', background: '#f1f5f9', padding: '2px 8px', borderRadius: 10 }}>{userRole}</span>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {error && <span style={{ color: '#dc2626', fontSize: 13, alignSelf: 'center' }}>{error}</span>}
            {canRun && (
              <button onClick={runWorkflow} disabled={running || saving} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#10b981', color: '#fff', fontSize: 13, fontWeight: 600, cursor: running ? 'not-allowed' : 'pointer', opacity: running || saving ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                ▶ Run
              </button>
            )}
            <button onClick={saveWorkflow} disabled={saving} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20 }}>
          {/* Steps Panel */}
          <div>
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: '#374151', margin: 0 }}>Steps ({steps.length})</h3>
                <div style={{ position: 'relative' }}>
                  <button onClick={() => setShowAddMenu(!showAddMenu)} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                    + Add Step
                  </button>
                  {showAddMenu && (
                    <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 8, zIndex: 10, width: 200, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                      {STEP_TYPES.map((st) => (
                        <button
                          key={st.type}
                          onClick={() => addStep(st.type)}
                          style={{ width: '100%', padding: '8px 12px', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer', borderRadius: 6, fontSize: 13, color: '#374151', display: 'flex', alignItems: 'center', gap: 8 }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                        >
                          <span>{st.icon}</span>
                          {st.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Step list with reorder */}
              {steps.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {steps.map((step, i) => (
                    <div
                      key={i}
                      onClick={() => setSelectedStep(i)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
                        background: selectedStep === i ? '#eff6ff' : '#fff',
                        border: selectedStep === i ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                        borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); moveStep(i, i - 1); }}
                          disabled={i === 0}
                          style={{ width: 20, height: 14, border: 'none', background: 'none', cursor: i === 0 ? 'default' : 'pointer', color: i === 0 ? '#d1d5db' : '#64748b', fontSize: 10, padding: 0, lineHeight: 1 }}
                        >▲</button>
                        <button
                          onClick={(e) => { e.stopPropagation(); moveStep(i, i + 1); }}
                          disabled={i === steps.length - 1}
                          style={{ width: 20, height: 14, border: 'none', background: 'none', cursor: i === steps.length - 1 ? 'default' : 'pointer', color: i === steps.length - 1 ? '#d1d5db' : '#64748b', fontSize: 10, padding: 0, lineHeight: 1 }}
                        >▼</button>
                      </div>
                      <span style={{ fontSize: 16 }}>{stepTypeOf(step.step_type)?.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{step.name}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{stepTypeOf(step.step_type)?.label}</div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeStep(i); }}
                        style={{ width: 24, height: 24, border: 'none', background: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 14, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#fef2f2')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                      >×</button>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                  <p>No steps yet. Click "+ Add Step" to start building.</p>
                </div>
              )}
            </div>
          </div>

          {/* Config Panel */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20, position: 'sticky', top: 80, maxHeight: 'calc(100vh - 100px)', overflowY: 'auto' }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: '#374151', margin: '0 0 16px' }}>
              {selectedStep !== null && steps[selectedStep] ? (
                <span>{stepTypeOf(steps[selectedStep].step_type)?.icon} Configure: {steps[selectedStep].name}</span>
              ) : (
                'Select a step to configure'
              )}
            </h3>
            {selectedStep !== null && steps[selectedStep] ? (
              <StepConfig step={steps[selectedStep]} onChange={(u) => updateStep(selectedStep, u)} />
            ) : (
              <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>⚙️</div>
                <p>Select a step from the list to configure it</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
