import { useConnectionStore } from '@/store/connectionStore'
import { theme } from '@/theme'

/** Top-bar indicator showing the active connection name. */
export function ConnectionBadge() {
  const { profiles, activeConnectionId } = useConnectionStore()
  const active = profiles.find(p => p.id === activeConnectionId)

  if (!active) {
    return (
      <span style={{ fontSize: 12, color: theme.textMuted }}>Not connected</span>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: '#a6e3a1', display: 'inline-block',
      }} />
      <span style={{ fontSize: 12, color: theme.textPrimary }}>
        {active.name}
      </span>
      <span style={{ fontSize: 11, color: theme.textMuted }}>
        [{active.db_type}] {active.host}/{active.database}
      </span>
    </div>
  )
}
