import { useConnectionStore } from '@/store/connectionStore'
import { theme } from '@/theme'

/** Top-bar indicator showing all open connections. */
export function ConnectionBadge() {
  const { profiles, connectedIds } = useConnectionStore()
  const connected = profiles.filter(p => connectedIds.has(p.id))

  if (connected.length === 0) {
    return <span style={{ fontSize: 12, color: theme.textMuted }}>Not connected</span>
  }

  if (connected.length === 1) {
    const c = connected[0]
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#a6e3a1', display: 'inline-block' }} />
        <span style={{ fontSize: 12, color: theme.textPrimary }}>{c.name}</span>
        <span style={{ fontSize: 11, color: theme.textMuted }}>[{c.db_type}] {c.host}/{c.database}</span>
      </div>
    )
  }

  // Multiple connections
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#a6e3a1', display: 'inline-block' }} />
      <span style={{ fontSize: 12, color: theme.textPrimary }}>
        {connected.map(c => c.name).join(', ')}
      </span>
      <span style={{
        fontSize: 10, color: '#a6e3a1',
        background: 'rgba(166,227,161,0.15)',
        border: '1px solid rgba(166,227,161,0.3)',
        borderRadius: 10, padding: '1px 7px',
      }}>
        {connected.length} connections
      </span>
    </div>
  )
}
