import { useState } from 'react'
import { useConnectionStore } from '@/store/connectionStore'
import { useSchemaStore } from '@/store/schemaStore'
import { useQueryStore } from '@/store/queryStore'
import { useUIStore } from '@/store/uiStore'
import { ConnectionForm } from './ConnectionForm'
import type { ConnectionFormData, ConnectionProfile } from '@/types/connection'
import { theme } from '@/theme'

/** Left panel: list of saved connection profiles with multi-connect support. */
export function ConnectionList() {
  const {
    profiles, connectedIds,
    connectingId, connect, disconnect,
    createProfile, updateProfile, deleteProfile, loadProfiles,
    error, clearError,
  } = useConnectionStore()
  const { loadSchema, clearSchema } = useSchemaStore()
  const { loadHistory } = useQueryStore()
  const setLeftPanel = useUIStore(s => s.setLeftPanel)

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing]   = useState<ConnectionProfile | null>(null)

  const handleConnect = async (id: string) => {
    clearError()
    try {
      await connect(id)
      await Promise.all([loadSchema(id), loadHistory(id)])
      setLeftPanel('explorer')
    } catch { /* error stored in connectionStore.error */ }
  }

  const handleDisconnect = async (id: string) => {
    await disconnect(id)
    clearSchema(id)
  }

  const handleSave = async (data: ConnectionFormData) => {
    if (editing) {
      await updateProfile(editing.id, data)
      setEditing(null)
    } else {
      await createProfile(data)
      setShowForm(false)
    }
    await loadProfiles()
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>Connections</span>
        <button style={styles.addBtn} onClick={() => setShowForm(true)} title="New connection">+</button>
      </div>

      {error && (
        <div style={styles.errorBanner}>
          <span style={{ flex: 1 }}>⚠ {error}</span>
          <button style={styles.errorClose} onClick={clearError}>✕</button>
        </div>
      )}

      <div style={styles.scrollArea}>
        {(showForm || editing) && (
          <div style={styles.formWrap}>
            <ConnectionForm
              initial={editing ?? undefined}
              onSave={handleSave}
              onCancel={() => { setShowForm(false); setEditing(null) }}
            />
          </div>
        )}

        <div style={styles.list}>
          {profiles.map(p => {
            const isConnected = connectedIds.has(p.id)

            return (
              <div
                key={p.id}
                style={{
                  ...styles.item,
                  background: isConnected ? 'rgba(166,227,161,0.05)' : 'transparent',
                }}
              >
                <span style={{
                  ...styles.dot,
                  background: isConnected ? '#a6e3a1' : theme.borderColor,
                }} />

                <span
                  style={{
                    ...styles.itemName,
                    color: isConnected ? '#a6e3a1' : theme.textPrimary,
                  }}
                  onClick={() => { if (!isConnected) handleConnect(p.id) }}
                  title={isConnected ? 'Connected' : 'Connect'}
                >
                  {p.name}
                  {connectingId === p.id && (
                    <span style={styles.connectingBadge}> connecting…</span>
                  )}
                </span>

                <span style={styles.typeBadge}>{p.db_type}</span>

                {isConnected && (
                  <button
                    style={{ ...styles.iconBtn, color: '#f38ba8', lineHeight: 1 }}
                    onClick={() => handleDisconnect(p.id)}
                    title="Disconnect"
                  >
                    {/* Unplug icon */}
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10 2v4M14 2v4M8 6h8l-1 7H9L8 6z"/>
                      <path d="M12 13v5M9 18h6"/>
                      <line x1="3" y1="3" x2="21" y2="21" strokeWidth="2"/>
                    </svg>
                  </button>
                )}

                <button style={styles.iconBtn} onClick={() => setEditing(p)} title="Edit">✎</button>
                <button
                  style={{ ...styles.iconBtn, ...styles.deleteBtn, lineHeight: 1 }}
                  onClick={() => deleteProfile(p.id)}
                  title="Delete connection profile"
                >
                  {/* Trash can icon */}
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14H6L5 6"/>
                    <path d="M10 11v6M14 11v6"/>
                    <path d="M9 6V4h6v2"/>
                  </svg>
                </button>
              </div>
            )
          })}
          {!profiles.length && (
            <div style={styles.empty}>No connections. Click + to add one.</div>
          )}
        </div>
      </div>
    </div>
  )
}

const styles = {
  container:      { display: 'flex' as const, flexDirection: 'column' as const, height: '100%', overflow: 'hidden' as const },
  header:         { display: 'flex' as const, alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: `1px solid ${theme.borderColor}`, flexShrink: 0 },
  title:          { fontSize: 12, fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase' as const, letterSpacing: 1 },
  addBtn:         { background: 'none', border: `1px solid ${theme.borderColor}`, color: theme.textPrimary, borderRadius: 4, width: 22, height: 22, cursor: 'pointer', fontSize: 16, lineHeight: '20px', textAlign: 'center' as const },
  errorBanner:    { display: 'flex' as const, alignItems: 'flex-start', gap: 8, padding: '8px 12px', background: 'rgba(243,139,168,0.12)', borderBottom: `1px solid rgba(243,139,168,0.3)`, color: '#f38ba8', fontSize: 12, flexShrink: 0 },
  errorClose:     { background: 'none', border: 'none', color: '#f38ba8', cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1, flexShrink: 0 },
  scrollArea:     { flex: 1, overflowY: 'auto' as const, minHeight: 0 },
  formWrap:       { padding: 12, borderBottom: `1px solid ${theme.borderColor}`, overflowY: 'auto' as const, maxHeight: '70vh' },
  list:           {},
  item:           { padding: '6px 10px', borderBottom: `1px solid ${theme.borderColor}`, display: 'flex' as const, alignItems: 'center', gap: 5 },
  dot:            { width: 6, height: 6, borderRadius: '50%', flexShrink: 0 },
  itemName:       { flex: 1, fontSize: 13, fontWeight: 500, cursor: 'pointer', overflow: 'hidden', whiteSpace: 'nowrap' as const, textOverflow: 'ellipsis' },
  connectingBadge:{ fontSize: 10, color: theme.textMuted, fontWeight: 400 },
  typeBadge:      { fontSize: 9, color: theme.textMuted, background: theme.bgSecondary, borderRadius: 3, padding: '1px 4px', flexShrink: 0, textTransform: 'uppercase' as const },
  iconBtn:        { background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: 13, padding: '2px 3px', flexShrink: 0 },
  deleteBtn:      { color: '#f38ba8' },
  empty:          { padding: 16, color: theme.textMuted, fontSize: 12, textAlign: 'center' as const },
}
