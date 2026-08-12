interface StepRun {
  id: string;
  step_type: string;
  status: string;
  output: any;
}

interface ApproveButtonProps {
  stepRun: StepRun;
  onApprove: (stepRunId: string, approved: boolean) => void;
  approving: boolean;
}

export default function ApproveButton({ stepRun, onApprove, approving }: ApproveButtonProps) {
  if (stepRun.status !== 'awaiting_approval') return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {stepRun.output?.message && (
        <p style={{ fontSize: 13, color: '#92400e', margin: 0 }}>{stepRun.output.message}</p>
      )}
      {stepRun.output?.required_role && (
        <p style={{ fontSize: 11, color: '#a16207', margin: 0 }}>
          Required role: <strong>{stepRun.output.required_role}</strong>
        </p>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={() => onApprove(stepRun.id, true)}
          disabled={approving}
          style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', background: '#10b981', color: '#fff', fontSize: 13, fontWeight: 600, cursor: approving ? 'not-allowed' : 'pointer', opacity: approving ? 0.6 : 1 }}
        >
          {approving ? 'Processing...' : '✓ Approve'}
        </button>
        <button
          onClick={() => onApprove(stepRun.id, false)}
          disabled={approving}
          style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', background: '#ef4444', color: '#fff', fontSize: 13, fontWeight: 600, cursor: approving ? 'not-allowed' : 'pointer', opacity: approving ? 0.6 : 1 }}
        >
          {approving ? 'Processing...' : '✗ Reject'}
        </button>
      </div>
    </div>
  );
}
