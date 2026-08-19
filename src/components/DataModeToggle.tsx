import type { CSSProperties } from 'react'

interface DataModeToggleProps {
  mode: 'real' | 'mock'
  showChooser: boolean
  onSelect: (mode: 'real' | 'mock') => void
}

const overlayStyle: CSSProperties = {
  position: 'fixed', inset: 0,
  background: 'var(--bg-overlay)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 1000,
}

const boxStyle: CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border-active)',
  borderRadius: '16px',
  padding: '2rem',
  maxWidth: '440px',
  width: '90%',
  display: 'flex', flexDirection: 'column', gap: '1.25rem',
  alignItems: 'center', textAlign: 'center',
  boxShadow: '0 16px 48px var(--shadow-mid)',
}

const titleStyle: CSSProperties = {
  fontSize: '1.2rem', fontWeight: 700, color: 'var(--text)', margin: 0,
}

const bodyStyle: CSSProperties = {
  fontSize: '0.95rem', color: 'var(--text-muted)', margin: 0,
}

const buttonRowStyle: CSSProperties = {
  display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center',
}

const pillStyle: CSSProperties = {
  position: 'fixed', bottom: '1rem', right: '1rem',
  padding: '6px 14px', borderRadius: '999px',
  background: 'var(--bg-card)',
  border: '1px solid var(--border-active)',
  color: 'var(--text-muted)', fontSize: '0.78rem',
  cursor: 'pointer', zIndex: 900,
  backdropFilter: 'var(--blur-glass)',
}

export default function DataModeToggle({ mode, showChooser, onSelect }: DataModeToggleProps) {
  if (showChooser) {
    return (
      <div style={overlayStyle}>
        <div style={boxStyle}>
          <h2 style={titleStyle}>Welcome</h2>
          <p style={bodyStyle}>
            This dashboard can run on a sample demo portfolio or on your own imported data.
            You can switch between them at any time.
          </p>
          <div style={buttonRowStyle}>
            <button className="btn btn-primary" onClick={() => onSelect('mock')}>View Demo Data</button>
            <button className="btn btn-secondary" onClick={() => onSelect('real')}>Use My Real Data</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      style={pillStyle}
      onClick={() => onSelect(mode === 'mock' ? 'real' : 'mock')}
      title="Click to switch data source"
    >
      {mode === 'mock' ? 'Demo Data' : 'Live Data'}
    </div>
  )
}
