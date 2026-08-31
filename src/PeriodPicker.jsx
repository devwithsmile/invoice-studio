// Billing-period control — the segmented month presets plus the custom date
// pair. Used twice: once for the invoice default, once per overriding item.
const MODES = [
  ['this', 'This month'],
  ['last', 'Last month'],
  ['next', 'Next month'],
  ['custom', 'Custom'],
]

export default function PeriodPicker({ mode, customStart, customEnd, onChange, small }) {
  const fontSize = small ? 11.5 : 12.5
  return (
    <>
      <div style={{ display: 'flex', background: '#f2eee7', borderRadius: 10, padding: 3, gap: 2 }}>
        {MODES.map(([k, label]) => {
          const on = mode === k
          return (
            <button
              key={k}
              onClick={() => onChange({ tenureMode: k })}
              style={{
                flex: 1,
                border: 'none',
                borderRadius: 8,
                padding: small ? '7px 4px' : '9px 4px',
                fontSize,
                fontWeight: 500,
                cursor: 'pointer',
                background: on ? '#fff' : 'transparent',
                color: on ? '#3d3833' : '#8a7c6b',
                boxShadow: on ? '0 1px 3px rgba(61,56,51,0.15)' : 'none',
              }}
            >
              {label}
            </button>
          )
        })}
      </div>
      {mode === 'custom' && (
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            type="date"
            value={customStart}
            onChange={(e) => onChange({ customStart: e.target.value })}
            style={{ ...dateInp, fontSize: small ? 12.5 : 13 }}
          />
          <input
            type="date"
            value={customEnd}
            onChange={(e) => onChange({ customEnd: e.target.value })}
            style={{ ...dateInp, fontSize: small ? 12.5 : 13 }}
          />
        </div>
      )}
    </>
  )
}

const dateInp = {
  border: '1px solid #ddd4c4',
  borderRadius: 9,
  padding: '11px 13px',
  background: '#fdfcfa',
  flex: 1,
  minWidth: 0,
}
