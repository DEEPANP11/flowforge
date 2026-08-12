interface Step {
  id?: string;
  step_type: string;
  name: string;
  config: any;
  order_index: number;
}

interface StepListProps {
  steps: Step[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  onRemove: (index: number) => void;
}

const STEP_META: Record<string, { icon: string; color: string; bg: string }> = {
  llm_call: { icon: '🤖', color: '#7c3aed', bg: '#f5f3ff' },
  http_request: { icon: '🌐', color: '#2563eb', bg: '#eff6ff' },
  db_write: { icon: '💾', color: '#059669', bg: '#ecfdf5' },
  notify: { icon: '🔔', color: '#d97706', bg: '#fffbeb' },
  conditional_branch: { icon: '🔀', color: '#ea580c', bg: '#fff7ed' },
  approval_gate: { icon: '✅', color: '#dc2626', bg: '#fef2f2' },
};

export default function StepList({ steps, selectedIndex, onSelect, onRemove }: StepListProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {steps.map((step, index) => {
        const meta = STEP_META[step.step_type] || { icon: '📦', color: '#6b7280', bg: '#f9fafb' };
        const isSelected = selectedIndex === index;

        return (
          <div key={step.id || index}>
            <div
              onClick={() => onSelect(index)}
              style={{
                padding: '12px 16px',
                borderRadius: 8,
                border: `2px solid ${isSelected ? '#3b82f6' : '#e2e8f0'}`,
                background: isSelected ? '#eff6ff' : meta.bg,
                cursor: 'pointer',
                transition: 'all 0.15s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 20, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', borderRadius: 6, border: `1px solid ${meta.color}20` }}>
                  {meta.icon}
                </span>
                <div>
                  <div style={{ fontSize: 11, color: meta.color, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Step {index + 1} · {step.step_type.replace('_', ' ')}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#0f172a', marginTop: 2 }}>{step.name}</div>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(index);
                }}
                style={{ width: 24, height: 24, border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 14, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#dc2626')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
              >
                ✕
              </button>
            </div>
            {index < steps.length - 1 && (
              <div style={{ textAlign: 'center', color: '#cbd5e1', fontSize: 12, padding: '2px 0' }}>↓</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
