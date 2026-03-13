import { useState } from 'react'
import { useConnectionStore } from '@/store/connectionStore'
import { useSchemaStore } from '@/store/schemaStore'
import { useQueryStore } from '@/store/queryStore'
import { useUIStore } from '@/store/uiStore'
import { ConnectionForm } from './ConnectionForm'
import type { ConnectionFormData, ConnectionProfile } from '@/types/connection'
import { theme } from '@/theme'

/** Left panel: list of saved connection profiles with connect / add / edit controls. */
export function ConnectionList() {
  const { profiles, activeConnectionId, isConnecting, connect, disconnect,
          createProfile, updateProfile, deleteProfile, loadProfiles } = useConnectionStore()
  const { loadSchema, clearSchema } = useSchemaStore()
  const { loadHistory } = useQueryStore()
  const setLeftPanel = useUIStore(s => s.setLeftPanel)

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<ConnectionProfile | null>(null)

  const handleConnect = async (id: string) => {
    await connect(id)
    await Promise.all([loadSchema(id), loadHistory(id)])
    setLeftPanel('explorer')   // Only switch on explicit user connect, not auto-reconnect
  }

  const handleDisconnect = async () => {
    await disconnect()
    clearSchema()
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
          const isActive = p.id === activeConnectionId
          return (
            <div key={p.id} style={{
              ...styles.item,
              background: isActive ? theme.bgPanel : 'transparent',
            }}>
              <span
                style={{ ...styles.dot, background: isActive ? theme.accentColor : theme.borderColor }}
              />
              <span
                style={{ ...styles.itemName, color: isActive ? theme.accentColor : theme.textPrimary }}
                onClick={() => isActive ? handleDisconnect() : handleConnect(p.id)}
                title={isActive ? 'Disconnect' : 'Connect'}
              >
                {p.name}
              </span>
              <button style={styles.iconBtn} onClick={() => setEditing(p)} title="Edit">✎</button>
              <button style={{ ...styles.iconBtn, ...styles.deleteBtn }} onClick={() => deleteProfile(p.id)} title="Delete">✕</button>
            </div>
          )
        })}
        {!profiles.length && (
          <div style={styles.empty}>No connections. Click + to add one.</div>
        )}
      </div>
    </div>
  )
}

const styles = {
  container:  { display: 'flex' as const, flexDirection: 'column' as const, height: '100%' },
  header:     { display: 'flex' as const, alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: `1px solid ${theme.borderColor}` },
  title:      { fontSize: 12, fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase' as const, letterSpacing: 1 },
  addBtn:     { background: 'none', border: `1px solid ${theme.borderColor}`, color: theme.textPrimary, borderRadius: 4, width: 22, height: 22, cursor: 'pointer', fontSize: 16, lineHeight: '20px', textAlign: 'center' as const },
  formWrap:   { padding: 12, borderBottom: `1px solid ${theme.borderColor}` },
  list:       { flex: 1, overflowY: 'auto' as const },
  item:       { padding: '6px 12px', borderBottom: `1px solid ${theme.borderColor}`, display: 'flex' as const, alignItems: 'center', gap: 6 },
  dot:        { width: 6, height: 6, borderRadius: '50%', flexShrink: 0 },
  itemName:   { flex: 1, fontSize: 13, fontWeight: 500, cursor: 'pointer', overflow: 'hidden', whiteSpace: 'nowrap' as const, textOverflow: 'ellipsis' },
  iconBtn:    { background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: 13, padding: '2px 4px', flexShrink: 0 },
  deleteBtn:  { color: '#f38ba8' },
  empty:      { padding: 16, color: theme.textMuted, fontSize: 12, textAlign: 'center' as const },
}
