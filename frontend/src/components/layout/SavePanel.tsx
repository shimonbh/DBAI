import { useState } from 'react'
import { useUIStore } from '@/store/uiStore'
import { useEditorStore } from '@/store/editorStore'
import { useConnectionStore } from '@/store/connectionStore'
import { useQueryStore } from '@/store/queryStore'
import { aiService } from '@/services/aiService'
import { buildSqlHeader } from '@/utils/sqlHeader'

/** Save panel rendered at the bottom of the left panel when savePanelOpen. */
export function SavePanel() {
  const { closeSavePanel, setLeftPanel, setPendingScroll, aiHeaderEnabled, aiHeaderUser } = useUIStore(s => ({
    closeSavePanel:  s.closeSavePanel,
    setLeftPanel:    s.setLeftPanel,
    setPendingScroll: s.setPendingScroll,
    aiHeaderEnabled: s.aiHeaderEnabled,
    aiHeaderUser:    s.aiHeaderUser,
  }))
  const { tabs, activeTabId } = useEditorStore(s => ({ tabs: s.tabs, activeTabId: s.activeTabId }))
  const { activeConnectionId, profiles } = useConnectionStore(s => ({
    activeConnectionId: s.activeConnectionId,
    profiles:           s.profiles,
  }))
  const { saveQuery } = useQueryStore()

  const sql = tabs.find(t => t.id === activeTabId)?.sql ?? ''

  const [name, setName]       = useState('')
  const [desc, setDesc]       = useState('')
  const [saving, setSaving]   = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const handleSave = async () => {
    if (!name.trim() || !sql.trim()) return
    setSaving(true)
    setError(null)
    try {
      let sqlToSave = sql
      if (aiHeaderEnabled) {
        const connProfile   = profiles.find(p => p.id === activeConnectionId)
        const effectiveUser = aiHeaderUser.trim() || connProfile?.username || ''
        const purpose       = desc.trim() || name.trim()
        sqlToSave = buildSqlHeader(purpose, effectiveUser) + sql
      }
      const newQuery = await saveQuery({
        name:          name.trim(),
        description:   desc.trim() || undefined,
        sql_text:      sqlToSave,
        connection_id: activeConnectionId ?? undefined,
      })
      closeSavePanel()
      // Switch to Queries panel and scroll to the newly saved item
      setLeftPanel('queries')
      setPendingScroll(newQuery.id)
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleAIName = async () => {
    if (!activeConnectionId || !sql.trim()) return
    setAiLoading(true)
    setError(null)
    try {
      const { name: aiName, description: aiDesc } = await aiService.nameQuery(activeConnectionId, sql)
      setName(aiName)
      setDesc(aiDesc ?? '')
    } catch (e: unknown) {
      setError((e as Error).message ?? 'AI naming failed')
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <div style={S.panel}>
      <div style={S.header}>
        <span style={S.title}>Save Query</span>
        <button style={S.closeBtn} onClick={closeSavePanel} title="Close">✕</button>
      </div>

      {/* Description */}
      <input
        style={S.input}
        placeholder="Description (optional)"
        value={desc}
        autoFocus
        onChange={e => setDesc(e.target.value)}
      />

      {/* Name (headline) row with AI button — below description */}
      <div style={S.fieldRow}>
        <input
          style={S.input}
          placeholder="Query name *"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
        />
        <button
          style={S.aiNameBtn}
          onClick={handleAIName}
          disabled={aiLoading || !sql.trim() || !activeConnectionId}
          title="Generate name with AI"
        >
          {aiLoading ? '…' : '✨'}
        </button>
      </div>

      {error && <div style={S.error}>{error}</div>}

      {/* Action buttons */}
      <div style={S.btnRow}>
        <button style={S.cancelBtn} onClick={closeSavePanel}>Cancel</button>
        <button
          style={{ ...S.saveBtn, opacity: name.trim() && sql.trim() ? 1 : 0.5 }}
          disabled={!name.trim() || !sql.trim() || saving}
          onClick={handleSave}
        >
          {saving ? 'Saving…' : '💾 Save'}
        </button>
      </div>
    </div>
  )
}

const S = {
  panel:      { padding: '10px 12px', background: 'var(--bg-panel)', display: 'flex', flexDirection: 'column' as const, gap: 7 },
  header:     { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  title:      { fontSize: 11, fontWeight: 600 as const, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: 0.8 },
  closeBtn:   { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13, padding: 0, lineHeight: 1 },
  fieldRow:   { display: 'flex', gap: 6, alignItems: 'center' },
  input:      { flex: 1, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 5, padding: '6px 9px', color: 'var(--text-primary)', fontSize: 12, outline: 'none', boxSizing: 'border-box' as const, width: '100%' },
  aiNameBtn:  { background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 5, padding: '5px 10px', cursor: 'pointer', fontSize: 13, flexShrink: 0 },
  error:      { fontSize: 11, color: '#f38ba8' },
  btnRow:     { display: 'flex', gap: 6, justifyContent: 'flex-end' },
  cancelBtn:  { background: 'none', border: '1px solid var(--border-color)', borderRadius: 5, padding: '5px 12px', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12 },
  saveBtn:    { background: 'var(--accent-color)', border: 'none', borderRadius: 5, padding: '5px 14px', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 as const },
}
