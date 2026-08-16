import { useState, useEffect } from 'react';
import { useNhostClient } from '@nhost/react';
import { useRouter } from 'next/router';

const TEMPLATES = [
  {
    id: 'summarize-and-notify',
    name: 'Summarize & Notify',
    description: 'Use LLM to summarize text, then send notification via Slack or webhook',
    icon: '📝',
    tags: ['LLM', 'Notifications'],
    steps: [
      { step_type: 'llm_call', name: 'Summarize Content', order_index: 0, config: { provider: 'groq', model: 'llama-3.1-8b-instant', prompt: 'Summarize the following text in 3 bullet points:\n\n{{input.text}}' } },
      { step_type: 'notify', name: 'Send Summary', order_index: 1, config: { channel: 'slack', message_template: 'Summary: {{step_0.output.choices[0].message.content}}', subject: 'AI Summary', url: '', recipient: '' } },
    ],
  },
  {
    id: 'api-fetch-and-store',
    name: 'API Fetch & Store',
    description: 'Fetch data from an API endpoint and store the result in the database',
    icon: '🔄',
    tags: ['HTTP', 'Database'],
    steps: [
      { step_type: 'http_request', name: 'Fetch API Data', order_index: 0, config: { method: 'GET', url: 'https://jsonplaceholder.typicode.com/posts/1', headers: {}, body: {} } },
      { step_type: 'db_write', name: 'Store Result', order_index: 1, config: { operation: 'insert', table: 'execution_logs', columns: { event_type: 'api_fetch', event_data: {} } } },
    ],
  },
  {
    id: 'conditional-workflow',
    name: 'Conditional Branch',
    description: 'Run different actions based on a condition using LLM or HTTP results',
    icon: '🔀',
    tags: ['Conditional', 'LLM'],
    steps: [
      { step_type: 'http_request', name: 'Check Status', order_index: 0, config: { method: 'GET', url: 'https://jsonplaceholder.typicode.com/posts/1', headers: {}, body: {} } },
      { step_type: 'conditional_branch', name: 'Check if Valid', order_index: 1, config: { condition: { left: '{{step_0.output.status}}', operator: '==', right: '200' }, true_next_step_index: 2, false_next_step_index: 2 } },
      { step_type: 'llm_call', name: 'Analyze Result', order_index: 2, config: { provider: 'groq', model: 'llama-3.1-8b-instant', prompt: 'Analyze this data and provide a brief summary:\n\n{{step_0.output}}' } },
    ],
  },
  {
    id: 'full-pipeline',
    name: 'Full AI Pipeline',
    description: 'Complete pipeline: HTTP fetch, LLM analysis, DB storage, and notification',
    icon: '🚀',
    tags: ['Full Stack', 'AI'],
    steps: [
      { step_type: 'http_request', name: 'Fetch Data', order_index: 0, config: { method: 'GET', url: 'https://jsonplaceholder.typicode.com/posts/1', headers: {}, body: {} } },
      { step_type: 'llm_call', name: 'AI Analysis', order_index: 1, config: { provider: 'groq', model: 'llama-3.1-8b-instant', prompt: 'Analyze this API response and provide key insights:\n\n{{step_0.output}}' } },
      { step_type: 'db_write', name: 'Store Analysis', order_index: 2, config: { operation: 'insert', table: 'execution_logs', columns: { event_type: 'ai_analysis', event_data: {} } } },
      { step_type: 'notify', name: 'Notify Team', order_index: 3, config: { channel: 'slack', message_template: 'Analysis complete: {{step_1.output.choices[0].message.content}}', subject: 'AI Analysis Complete', url: '', recipient: '' } },
    ],
  },
  {
    id: 'approval-pipeline',
    name: 'Approval Pipeline',
    description: 'LLM analysis with human approval gate before storing results',
    icon: '✅',
    tags: ['Approval', 'LLM'],
    steps: [
      { step_type: 'llm_call', name: 'Generate Report', order_index: 0, config: { provider: 'groq', model: 'llama-3.1-8b-instant', prompt: 'Generate a brief report based on:\n{{input.text}}' } },
      { step_type: 'approval_gate', name: 'Review Required', order_index: 1, config: { required_role: 'editor', message: 'Please review the generated report before storing' } },
      { step_type: 'db_write', name: 'Store Approved Report', order_index: 2, config: { operation: 'insert', table: 'execution_logs', columns: { event_type: 'approved_report', event_data: {} } } },
    ],
  },
];

export default function Templates() {
  const nhost = useNhostClient();
  const router = useRouter();
  const [creating, setCreating] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const check = async () => {
      await nhost.auth.getSession();
      setReady(true);
      if (!nhost.auth.isAuthenticated()) router.push('/login');
    };
    check();
  }, []);

  async function gqlFetch(query: string, variables: any = {}) {
    const { data, error } = await nhost.graphql.request(query, variables);
    if (error) {
      console.error('GQL Error:', JSON.stringify(error, null, 2));
      throw new Error('GraphQL request failed');
    }
    return data;
  }

  async function createFromTemplate(template: (typeof TEMPLATES)[0]) {
    setCreating(template.id);
    try {
      const user = nhost.auth.getUser();
      if (!user) return;

      const membershipData = await gqlFetch(
        `query($uid: uuid!) { org_members(where: { user_id: { _eq: $uid } }, limit: 1) { org_id } }`,
        { uid: user.id }
      );
      const orgId = membershipData?.org_members?.[0]?.org_id;
      if (!orgId) return;

      const insertData = await gqlFetch(
        `mutation($oid: uuid!, $uid: uuid!, $name: String!, $desc: String!) {
          insert_workflows_one(object: {
            org_id: $oid, name: $name, description: $desc, created_by: $uid
          }) { id }
        }`,
        { oid: orgId, uid: user.id, name: template.name, desc: template.description }
      );
      const workflowId = insertData?.insert_workflows_one?.id;
      if (!workflowId) return;

      for (const step of template.steps) {
        const stepType = step.step_type;
        await gqlFetch(
          `mutation($wid: uuid!, $name: String!, $idx: Int!, $config: jsonb!) {
            insert_workflow_steps_one(object: {
              workflow_id: $wid, name: $name, step_type: ${stepType}, order_index: $idx, config: $config
            }) { id }
          }`,
          { wid: workflowId, name: step.name, idx: step.order_index, config: step.config }
        );
      }

      router.push(`/workflow/${workflowId}`);
    } catch (e) {
      console.error('Template creation error:', e);
    } finally {
      setCreating(null);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      <header style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={() => router.push('/')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#64748b' }}>
            ← Back
          </button>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', margin: 0 }}>Workflow Templates</h1>
        </div>
      </header>
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>
        <p style={{ color: '#64748b', marginBottom: 24, fontSize: 14 }}>Start with a pre-built template and customize it for your needs</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
          {TEMPLATES.map((template) => (
            <div key={template.id} style={{ background: '#fff', borderRadius: 12, padding: 24, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>{template.icon}</div>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', margin: '0 0 8px' }}>{template.name}</h3>
              <p style={{ fontSize: 13, color: '#64748b', marginBottom: 12, flex: 1, lineHeight: 1.5 }}>{template.description}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                {template.tags.map((tag) => (
                  <span key={tag} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: '#eff6ff', color: '#2563eb', fontWeight: 500 }}>{tag}</span>
                ))}
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 12 }}>{template.steps.length} steps</div>
              <button
                onClick={() => createFromTemplate(template)}
                disabled={creating !== null}
                style={{ width: '100%', padding: '8px 0', borderRadius: 8, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 500, cursor: creating ? 'not-allowed' : 'pointer', opacity: creating ? 0.6 : 1 }}
              >
                {creating === template.id ? 'Creating...' : 'Use Template'}
              </button>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
