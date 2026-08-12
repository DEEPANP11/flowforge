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
  approved_at?: string;
}

interface StatusTimelineProps {
  stepRuns: StepRun[];
  currentStepIndex: number;
  onApprove: (stepRunId: string, approved: boolean) => void;
  approving: boolean;
}

const STEP_META: Record<string, { icon: string; name: string; color: string; bg: string }> = {
  llm_call: { icon: '🤖', name: 'LLM Call', color: '#7c3aed', bg: '#f5f3ff' },
  http_request: { icon: '🌐', name: 'HTTP Request', color: '#2563eb', bg: '#eff6ff' },
  db_write: { icon: '💾', name: 'DB Write', color: '#059669', bg: '#ecfdf5' },
  notify: { icon: '🔔', name: 'Notify', color: '#d97706', bg: '#fffbeb' },
  conditional_branch: { icon: '🔀', name: 'Condition', color: '#ea580c', bg: '#fff7ed' },
  approval_gate: { icon: '✅', name: 'Approval', color: '#dc2626', bg: '#fef2f2' },
};

const STATUS_STYLES: Record<string, { border: string; bg: string; text: string; label: string }> = {
  completed: { border: '#10b981', bg: '#ecfdf5', text: '#059669', label: '✓ Completed' },
  running: { border: '#3b82f6', bg: '#eff6ff', text: '#2563eb', label: '⏳ Running' },
  failed: { border: '#ef4444', bg: '#fef2f2', text: '#dc2626', label: '✗ Failed' },
  awaiting_approval: { border: '#f59e0b', bg: '#fffbeb', text: '#d97706', label: '⏸️ Awaiting' },
  pending: { border: '#d1d5db', bg: '#f9fafb', text: '#6b7280', label: '○ Pending' },
};

export default function StatusTimeline({ stepRuns, currentStepIndex, onApprove, approving }: StatusTimelineProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {stepRuns.map((stepRun, index) => {
        const meta = STEP_META[stepRun.step_type] || { icon: '📦', name: 'Step', color: '#6b7280', bg: '#f9fafb' };
        const ss = STATUS_STYLES[stepRun.status] || STATUS_STYLES.pending;

        return (
          <div key={stepRun.id} style={{ display: 'flex', gap: 12 }}>
            {/* Timeline indicator */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 40 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: '#fff',
                  border: `2px solid ${ss.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14,
                  fontWeight: 600,
                  color: ss.text,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                  flexShrink: 0,
                }}
              >
                {stepRun.status === 'completed' ? '✓' : stepRun.status === 'failed' ? '✗' : stepRun.order_index + 1}
              </div>
              {index < stepRuns.length - 1 && (
                <div style={{ width: 2, flex: 1, minHeight: 16, background: '#e2e8f0' }} />
              )}
            </div>

            {/* Step card */}
            <div
              style={{
                flex: 1,
                padding: 14,
                borderRadius: 8,
                border: `1px solid ${ss.border}30`,
                background: ss.bg,
                marginBottom: index < stepRuns.length - 1 ? 0 : 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: stepRun.output && stepRun.status === 'completed' ? 8 : 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 18 }}>{meta.icon}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
                      Step {stepRun.order_index + 1}: {meta.name}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{stepRun.step_type.replace('_', ' ')}</div>
                  </div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 500, color: ss.text, background: `${ss.border}15`, padding: '2px 8px', borderRadius: 12 }}>
                  {ss.label}
                </span>
              </div>

              {stepRun.output && stepRun.status === 'completed' && (
                <div style={{ marginTop: 8, padding: 10, background: '#fff', borderRadius: 6, fontSize: 11, fontFamily: 'monospace', color: '#64748b', maxHeight: 120, overflow: 'auto', border: '1px solid #e2e8f0' }}>
                  {typeof stepRun.output === 'string' ? stepRun.output : JSON.stringify(stepRun.output, null, 2)}
                </div>
              )}

              {stepRun.error_message && stepRun.status === 'failed' && (
                <div style={{ marginTop: 8, padding: 10, background: '#fef2f2', borderRadius: 6, fontSize: 11, color: '#dc2626' }}>
                  {stepRun.error_message}
                </div>
              )}

              {stepRun.started_at && (
                <div style={{ marginTop: 6, fontSize: 11, color: '#94a3b8' }}>
                  {stepRun.completed_at
                    ? `Duration: ${Math.round((new Date(stepRun.completed_at).getTime() - new Date(stepRun.started_at).getTime()) / 1000)}s`
                    : 'Running...'}
                  {stepRun.attempt_count > 1 && <span style={{ marginLeft: 8 }}>(Attempt {stepRun.attempt_count})</span>}
                </div>
              )}

              {stepRun.status === 'awaiting_approval' && (
                <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => onApprove(stepRun.id, true)}
                    disabled={approving}
                    style={{ padding: '5px 14px', borderRadius: 6, border: 'none', background: '#10b981', color: '#fff', fontSize: 12, fontWeight: 500, cursor: approving ? 'not-allowed' : 'pointer', opacity: approving ? 0.6 : 1 }}
                  >
                    {approving ? 'Processing...' : 'Approve'}
                  </button>
                  <button
                    onClick={() => onApprove(stepRun.id, false)}
                    disabled={approving}
                    style={{ padding: '5px 14px', borderRadius: 6, border: 'none', background: '#ef4444', color: '#fff', fontSize: 12, fontWeight: 500, cursor: approving ? 'not-allowed' : 'pointer', opacity: approving ? 0.6 : 1 }}
                  >
                    Reject
                  </button>
                </div>
              )}

              {stepRun.approved_by && (
                <div style={{ marginTop: 6, fontSize: 11, color: '#059669' }}>
                  Approved by user
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
