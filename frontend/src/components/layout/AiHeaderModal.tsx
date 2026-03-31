import { useState } from 'react'
import { useUIStore } from '@/store/uiStore'
import { useConnectionStore } from '@/store/connectionStore'

interface Props { onClose: () => void }

export function AiHeaderModal({ onClose }: Props) {
  const { aiHeaderEnabled, toggleAiHeader, aiHeaderUser, setAiHeaderUser } =
    useUIStore(s => ({
      aiHeaderEnabled: s.aiHeaderEnabled,
      toggleAiHeader:  s.toggleAiHeader,
      aiHeaderUser:    s.aiHeaderUser,
      setAiHeaderUser: s.setAiHeaderUser,
    }))
  const { profiles, activeConnectionId } = useConnectionStore(s => ({
    profiles: s.profiles, activeConnectionId: s.activeConnectionId,
  }))
  const connUsername = profiles.find(p => p.id === activeConnectionId)?.username ?? ''
  const effectiveAuthor = aiHeaderUser.trim() || connUsername

  const previewLines = () => {
    const line = '-- ' + '─'.repeat(43)
    const ts = new Date().toISOString().slice(0, 16).replace('T', ' ')
    const lines = [line, `-- Generated: ${ts}`]
    if (effectiveAuthor) lines.push(`-- Author   : ${effectiveAuthor}`)
    lines.push(`-- Purpose  : <query description>`, line)
    return lines.join('\n')
  }

  return (
    <div style={S.backdrop} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={S.header}>
          <span style={S.title}>AI Query Header</span>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.row}>
          <span style={S.label}>Add header to AI queries</span>
          <div style={S.toggleRow} onClick={toggleAiHeader}>
            <div style={{ ...S.track, background: aiHeaderEnabled ? 'var(--accent-color)' : 'var(--border-color)' }}>
              <div style={{ ...S.thumb, transform: aiHeaderEnabled ? 'translateX(18px)' : 'translateX(2px)' }} />
            </div>
            <span style={S.toggleLabel}>{aiHeaderEnabled ? 'On' : 'Off'}</span>
          </div>
        </div>
        {aiHeaderEnabled && (
          <div style={S.row}>
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 2 }}>
              <span style={S.label}>Author name</span>
              {connUsername && !aiHeaderUser.trim() && (
                <span style={S.hint}>Auto-filled from connection: {connUsername}</span>
              )}
            </div>
            <input style={S.input} type="text" placeholder={connUsername || 'Override author name'}
              value={aiHeaderUser} onChange={e => setAiHeaderUser(e.target.value)} />
          </div>
        )}
        {aiHeaderEnabled && (
          <div style={S.preview}>
            <div style={S.previewTitle}>Header preview</div>
            <pre style={S.previewCode}>{previewLines()}</pre>
          </div>
        )}
      </div>
    </div>
  )
}

const S = {
  backdrop:     { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modal:        { background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '18px 22px', minWidth: 320, maxWidth: 420, display: 'flex', flexDirection: 'column' as const, gap: 14, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' },
  header:       { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  title:        { fontSize: 14, fontWeight: 700 as const, color: 'var(--text-primary)' },
  closeBtn:     { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, padding: 0 },
  row:          { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  label:        { fontSize: 13, color: 'var(--text-primary)' },
  hint:         { fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' as const },
  toggleRow:    { display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' },
  track:        { width: 38, height: 20, borderRadius: 10, transition: 'background 0.2s', position: 'relative' as const, flexShrink: 0 },
  thumb:        { position: 'absolute' as const, top: 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'transform 0.2s' },
  toggleLabel:  { fontSize: 12, color: 'var(--text-muted)', userSelect: 'none' as const },
  input:        { background: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: 5, padding: '5px 8px', color: 'var(--text-primary)', fontSize: 13, outline: 'none' },
  preview:      { background: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: 6, padding: '8px 10px', display: 'flex', flexDirection: 'column' as const, gap: 5 },
  previewTitle: { fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 as const, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  previewCode:  { margin: 0, fontSize: 10, color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'pre' as const, lineHeight: 1.6 },
}
