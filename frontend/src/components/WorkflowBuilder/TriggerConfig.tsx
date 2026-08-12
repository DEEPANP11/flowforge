const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, color: '#334155', background: '#fff', outline: 'none' };
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4, display: 'block' };

interface TriggerConfigProps {
  type: string;
  config: any;
  onChange: (type: string, config: any) => void;
}

export default function TriggerConfig({ type, config, onChange }: TriggerConfigProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <label style={labelStyle}>Trigger Type</label>
        <select
          value={type || 'manual'}
          onChange={(e) => onChange(e.target.value, config || {})}
          style={inputStyle}
        >
          <option value="manual">Manual</option>
          <option value="webhook">Webhook</option>
          <option value="scheduled">Scheduled</option>
          <option value="database_event">Database Event</option>
        </select>
      </div>

      {type === 'manual' && (
        <p style={{ fontSize: 13, color: '#64748b' }}>Click "Save" then run the workflow manually from the dashboard.</p>
      )}

      {type === 'webhook' && (
        <div style={{ background: '#f8fafc', borderRadius: 8, padding: 12 }}>
          <p style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>Webhook URL (POST to trigger):</p>
          <code style={{ fontSize: 11, background: '#fff', padding: '6px 10px', borderRadius: 4, display: 'block', wordBreak: 'break-all', color: '#334155', border: '1px solid #e2e8f0' }}>
            {`https://egkwhbnpexegppxvmiqf.ap-south-1.nhost.app/v1/functions/webhookTrigger`}
          </code>
          <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>Send a POST request with {`{"workflow_id": "<id>"}`} in the body.</p>
        </div>
      )}

      {type === 'scheduled' && (
        <div>
          <label style={labelStyle}>Cron Expression</label>
          <input
            type="text"
            value={config?.cron || '0 * * * *'}
            onChange={(e) => onChange(type, { ...(config || {}), cron: e.target.value })}
            style={{ ...inputStyle, fontFamily: 'monospace' }}
            placeholder="0 * * * *"
          />
          <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Every hour: 0 * * * * · Every day 9am: 0 9 * * *</p>
        </div>
      )}

      {type === 'database_event' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={labelStyle}>Table Name</label>
            <input type="text" value={config?.table || ''} onChange={(e) => onChange(type, { ...(config || {}), table: e.target.value })} style={inputStyle} placeholder="e.g., customers" />
          </div>
          <div>
            <label style={labelStyle}>Operation</label>
            <select value={config?.operation || 'insert'} onChange={(e) => onChange(type, { ...(config || {}), operation: e.target.value })} style={inputStyle}>
              <option value="insert">Insert</option>
              <option value="update">Update</option>
              <option value="delete">Delete</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
