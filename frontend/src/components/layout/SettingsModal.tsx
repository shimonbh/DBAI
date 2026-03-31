import { useState } from 'react'
import { useUIStore } from '@/store/uiStore'
import { useEditorStore } from '@/store/editorStore'

const LIMIT_KEY = 'dbai_query_limit'

interface Props { onClose: () => void }

/** Gear settings modal: dark/light toggle + query row limit. */
export function SettingsModal({ onClose }: Props) {
  const { isDark, toggleDark } =
    useUIStore(s => ({
      isDark:     s.isDark,
      toggleDark: s.toggleDark,
    }))
  const { queryLimit, setQueryLimit } = useEditorStore(s => ({ queryLimit: s.queryLimit, setQueryLimit: s.setQueryLimit }))
  const [limitInput, setLimitInput] = useState(String(queryLimit))

  const handleLimitChange = (val: string) => {
    setLimitInput(val)
    const n = Number(val)
    if (n > 0 && n <= 10000) {
      localStorage.setItem(LIMIT_KEY, String(n))
      setQueryLimit(n)
    }
  }

  return (
    <div style={S.backdrop} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={S.header}>
          <span style={S.title}>Settings</span>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Dark / Light mode */}
        <div style={S.row}>
          <span style={S.label}>Theme</span>
          <div style={S.toggleRow} onClick={toggleDark}>
            <div style={{ ...S.track, background: isDark ? 'var(--accent-color)' : 'var(--border-color)' }}>
              <div style={{ ...S.thumb, transform: isDark ? 'translateX(18px)' : 'translateX(2px)' }} />
            </div>
            <span style={S.toggleLabel}>{isDark ? '🌙 Dark' : '☀️ Light'}</span>
          </div>
        </div>

        {/* Query row limit */}
        <div style={S.row}>
          <span style={S.label}>Query row limit</span>
          <input
            style={S.input}
            type="number"
            min={1}
            max={10000}
            value={limitInput}
            onChange={e => handleLimitChange(e.target.value)}
          />
        </div>

      </div>
    </div>
  )
}

const S = {
  backdrop:  { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modal:     { background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '18px 22px', minWidth: 320, maxWidth: 420, display: 'flex', flexDirection: 'column' as const, gap: 14, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' },
  header:    { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  title:     { fontSize: 14, fontWeight: 700 as const, color: 'var(--text-primary)' },
  closeBtn:  { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, padding: 0 },
  row:       { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  label:     { fontSize: 13, color: 'var(--text-primary)' },
  toggleRow: { display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' },
  track:     { width: 38, height: 20, borderRadius: 10, transition: 'background 0.2s', position: 'relative' as const, flexShrink: 0 },
  thumb:     { position: 'absolute' as const, top: 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'transform 0.2s' },
  toggleLabel: { fontSize: 12, color: 'var(--text-muted)', userSelect: 'none' as const },
  input:     { background: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: 5, padding: '5px 8px', color: 'var(--text-primary)', fontSize: 13, outline: 'none' },
}
