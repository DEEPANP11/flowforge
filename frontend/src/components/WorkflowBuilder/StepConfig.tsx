interface Step {
  id?: string;
  step_type: string;
  name: string;
  config: any;
  order_index: number;
}

interface StepConfigProps {
  step: Step;
  onChange: (updates: Partial<Step>) => void;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 6,
  border: '1px solid #d1d5db',
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 500,
  color: '#374151',
  marginBottom: 4,
};

export default function StepConfig({ step, onChange }: StepConfigProps) {
  const config = step.config || {};

  function updateConfig(key: string, value: any) {
    onChange({ config: { ...config, [key]: value } });
  }

  if (step.step_type === 'llm_call') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={labelStyle}>Provider</label>
          <select value={config.provider || 'groq'} onChange={(e) => updateConfig('provider', e.target.value)} style={inputStyle}>
            <option value="groq">Groq</option>
            <option value="openrouter">OpenRouter</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Model</label>
          <input type="text" value={config.model || ''} onChange={(e) => updateConfig('model', e.target.value)} style={inputStyle} placeholder={config.provider === 'openrouter' ? 'meta-llama/llama-3.1-8b-instruct' : 'llama-3.1-8b-instant'} />
        </div>
        <div>
          <label style={labelStyle}>Prompt</label>
          <textarea value={config.prompt || ''} onChange={(e) => updateConfig('prompt', e.target.value)} rows={5} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Use {{previous.output.field}} for variable references" />
        </div>
      </div>
    );
  }

  if (step.step_type === 'http_request') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={labelStyle}>Method</label>
          <select value={config.method || 'GET'} onChange={(e) => updateConfig('method', e.target.value)} style={inputStyle}>
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="DELETE">DELETE</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>URL</label>
          <input type="url" value={config.url || ''} onChange={(e) => updateConfig('url', e.target.value)} style={inputStyle} placeholder="https://jsonplaceholder.typicode.com/posts/1" />
        </div>
        <div>
          <label style={labelStyle}>Body (JSON)</label>
          <textarea
            value={JSON.stringify(config.body || {}, null, 2)}
            onChange={(e) => {
              try {
                updateConfig('body', JSON.parse(e.target.value));
              } catch {}
            }}
            rows={4}
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }}
          />
        </div>
      </div>
    );
  }

  if (step.step_type === 'db_write') {
    const tableColumns: Record<string, string[]> = {
      execution_logs: ['event_type', 'event_data', 'workflow_run_id', 'step_run_id', 'user_id'],
      workflow_variables: ['workflow_id', 'variable_name', 'default_value', 'is_secret'],
      api_credentials: ['org_id', 'name', 'credential_type', 'encrypted_value'],
    };
    const selectedTable = config.table || 'execution_logs';
    const validColumns = tableColumns[selectedTable] || [];

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={labelStyle}>Operation</label>
          <select value={config.operation || 'insert'} onChange={(e) => updateConfig('operation', e.target.value)} style={inputStyle}>
            <option value="insert">Insert</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Table</label>
          <select value={config.table || ''} onChange={(e) => updateConfig('table', e.target.value)} style={inputStyle}>
            <option value="">Select table...</option>
            <option value="execution_logs">execution_logs</option>
            <option value="workflow_variables">workflow_variables</option>
            <option value="api_credentials">api_credentials</option>
          </select>
        </div>
        {selectedTable && (
          <div style={{ padding: 10, background: '#f8fafc', borderRadius: 6, fontSize: 12, color: '#64748b' }}>
            <strong>Valid columns:</strong> {validColumns.join(', ')}
          </div>
        )}
        <div>
          <label style={labelStyle}>Columns (JSON)</label>
          <textarea
            value={JSON.stringify(config.columns || {}, null, 2)}
            onChange={(e) => {
              try {
                updateConfig('columns', JSON.parse(e.target.value));
              } catch {}
            }}
            rows={4}
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }}
          />
        </div>
      </div>
    );
  }

  if (step.step_type === 'notify') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={labelStyle}>Channel</label>
          <select value={config.channel || 'slack'} onChange={(e) => updateConfig('channel', e.target.value)} style={inputStyle}>
            <option value="slack">Slack</option>
            <option value="email">Email</option>
            <option value="webhook">Webhook</option>
          </select>
        </div>
        {config.channel === 'slack' && (
          <div>
            <label style={labelStyle}>Slack Webhook URL</label>
            <input type="url" value={config.url || ''} onChange={(e) => updateConfig('url', e.target.value)} style={inputStyle} placeholder="https://hooks.slack.com/services/..." />
          </div>
        )}
        {config.channel === 'email' && (
          <>
            <div>
              <label style={labelStyle}>Recipient Email</label>
              <input type="email" value={config.recipient || ''} onChange={(e) => updateConfig('recipient', e.target.value)} style={inputStyle} placeholder="team@example.com" />
            </div>
            <div>
              <label style={labelStyle}>Web3Forms Access Key</label>
              <input type="password" value={config.url || ''} onChange={(e) => updateConfig('url', e.target.value)} style={inputStyle} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Get free key at <a href="https://web3forms.com" target="_blank" rel="noopener" style={{ color: '#3b82f6' }}>web3forms.com</a> — 250 submissions/month free</div>
            </div>
          </>
        )}
        {config.channel === 'webhook' && (
          <div>
            <label style={labelStyle}>Webhook URL</label>
            <input type="url" value={config.url || ''} onChange={(e) => updateConfig('url', e.target.value)} style={inputStyle} placeholder="https://your-api.com/webhook" />
          </div>
        )}
        <div>
          <label style={labelStyle}>Subject</label>
          <input type="text" value={config.subject || ''} onChange={(e) => updateConfig('subject', e.target.value)} style={inputStyle} placeholder="Workflow Notification" />
        </div>
        <div>
          <label style={labelStyle}>Message Template</label>
          <textarea value={config.message_template || ''} onChange={(e) => updateConfig('message_template', e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Workflow completed. Output: {{step_0.output}}" />
        </div>
      </div>
    );
  }

  if (step.step_type === 'conditional_branch') {
    var cond = config.condition;
    var condStr = '';
    if (typeof cond === 'string') {
      condStr = cond;
    } else if (cond && typeof cond === 'object') {
      condStr = (cond.left || '') + ' ' + (cond.operator || '==') + ' ' + (cond.right || '');
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={labelStyle}>Condition</label>
          <input
            type="text"
            value={condStr}
            onChange={(e) => {
              const val = e.target.value;
              const ops = ['contains', 'not_contains', 'starts_with', 'ends_with', '==', '!=', '>=', '<=', '>', '<'];
              let parsed = { left: val, operator: '==', right: '' };
              for (const op of ops) {
                const parts = val.split(' ' + op + ' ');
                if (parts.length === 2) {
                  parsed = { left: parts[0].trim(), operator: op, right: parts[1].trim() };
                  break;
                }
              }
              updateConfig('condition', parsed);
            }}
            style={{ ...inputStyle, fontFamily: 'monospace' }}
            placeholder="e.g. {{step_0.output.text}} contains healthcare"
          />
          <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{'Evaluates condition. Steps always run in order.'}</p>
        </div>
      </div>
    );
  }

  if (step.step_type === 'approval_gate') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={labelStyle}>Required Role</label>
          <select value={config.required_role || 'editor'} onChange={(e) => updateConfig('required_role', e.target.value)} style={inputStyle}>
            <option value="owner">Owner</option>
            <option value="editor">Editor</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Message</label>
          <textarea value={config.message || ''} onChange={(e) => updateConfig('message', e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Please review and approve this step" />
        </div>
      </div>
    );
  }

  return <p style={{ color: '#94a3b8', fontSize: 13 }}>No configuration for this step type.</p>;
}
