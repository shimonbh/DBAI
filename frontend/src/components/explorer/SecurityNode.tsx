import { useState, useEffect } from 'react'
import api from '@/services/api'
import { theme } from '@/theme'

interface SecurityUser { name: string; type: string; attributes: string[] }
interface SecurityRole { name: string; members: string[]; attributes: string[] }
interface SecurityData { users: SecurityUser[]; roles: SecurityRole[] }

interface Props {
  connectionId: string
  database: string
  expanded: boolean
  onToggle: () => void
}

export function SecurityNode({ connectionId, database, expanded, onToggle }: Props) {
  const [data, setData]     = useState<SecurityData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const [usersOpen, setUsersOpen] = useState(true)
  const [rolesOpen, setRolesOpen] = useState(true)

  useEffect(() => {
    if (!expanded || data || loading) return
    setLoading(true)
    api.get<SecurityData>(`/schema/${connectionId}/${database}/security`)
      .then(r => setData(r.data))
      .catch(e => setError(e.response?.data?.detail ?? e.message))
      .finally(() => setLoading(false))
  }, [expanded])

  const attrColor = (a: string) =>
    a === 'SUPERUSER' ? '#f59e0b'
    : a === 'DISABLED' || a === 'LOCKED' ? '#ef4444'
    : 'var(--accent-color)'

  return (
    <>
      {/* Category row */}
      <div style={s.catRow} onClick={onToggle}>
        <span style={s.catArrow}>{expanded ? '▾' : '▸'}</span>
        <span style={s.catIcon}>🔒</span>
        <span style={s.catLabel}>Security</span>
      </div>

      {expanded && (
        <div>
          {loading && <div style={s.msg}>Loading…</div>}
          {error   && <div style={{ ...s.msg, color: '#ef4444' }}>{error}</div>}
          {data && (
            <>
              {/* Users / Logins */}
              <div style={s.subRow} onClick={() => setUsersOpen(v => !v)}>
                <span style={s.subArrow}>{usersOpen ? '▾' : '▸'}</span>
                <span style={s.subIcon}>👤</span>
                <span style={s.subLabel}>Users / Logins</span>
                <span style={s.count}>{data.users.length}</span>
              </div>
              {usersOpen && (
                data.users.length === 0
                  ? <div style={s.empty}>No users found</div>
                  : data.users.map(u => (
                    <div key={u.name} style={s.itemRow}>
                      <span style={s.itemName} title={u.type}>{u.name}</span>
                      <span style={s.typeTag}>{u.type}</span>
                      {u.attributes.map(a => (
                        <span key={a} style={{ ...s.attr, color: attrColor(a), borderColor: attrColor(a) }}>{a}</span>
                      ))}
                    </div>
                  ))
              )}

              {/* Roles */}
              <div style={s.subRow} onClick={() => setRolesOpen(v => !v)}>
                <span style={s.subArrow}>{rolesOpen ? '▾' : '▸'}</span>
                <span style={s.subIcon}>🛡</span>
                <span style={s.subLabel}>Roles</span>
                <span style={s.count}>{data.roles.length}</span>
              </div>
              {rolesOpen && (
                data.roles.length === 0
                  ? <div style={s.empty}>No roles found</div>
                  : data.roles.map(r => (
                    <div key={r.name}>
                      <div style={s.itemRow}>
                        <span style={s.itemName}>{r.name}</span>
                        {r.members.length > 0 && (
                          <span style={s.typeTag}>{r.members.length} member{r.members.length !== 1 ? 's' : ''}</span>
                        )}
                      </div>
                      {r.members.map(m => (
                        <div key={m} style={{ ...s.itemRow, paddingLeft: 72 }}>
                          <span style={{ color: 'var(--text-muted)', fontSize: 10, marginRight: 4 }}>↳</span>
                          <span style={{ ...s.itemName, color: 'var(--text-muted)' }}>{m}</span>
                        </div>
                      ))}
                    </div>
                  ))
              )}
            </>
          )}
        </div>
      )}
    </>
  )
}

const s = {
  catRow:   { display: 'flex', alignItems: 'center', gap: 5, padding: '4px 12px 4px 28px', cursor: 'pointer', userSelect: 'none' as const },
  catArrow: { fontSize: 9, color: theme.textMuted, width: 10 },
  catIcon:  { fontSize: 11 },
  catLabel: { fontSize: 11, color: theme.textMuted, fontWeight: 600 as const, flex: 1, letterSpacing: 0.3 },
  subRow:   { display: 'flex', alignItems: 'center', gap: 5, padding: '3px 12px 3px 38px', cursor: 'pointer', userSelect: 'none' as const },
  subArrow: { fontSize: 9, color: theme.textMuted, width: 10 },
  subIcon:  { fontSize: 11 },
  subLabel: { fontSize: 11, color: theme.textMuted, flex: 1 },
  count:    { fontSize: 10, color: theme.textMuted, background: theme.bgPanel, borderRadius: 8, padding: '0 5px' },
  itemRow:  { display: 'flex', alignItems: 'center', flexWrap: 'wrap' as const, gap: 4, padding: '2px 12px 2px 52px' },
  itemName: { fontSize: 11, color: theme.textPrimary, flex: '0 0 auto', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  typeTag:  { fontSize: 9, color: theme.textMuted, background: theme.bgPanel, borderRadius: 3, padding: '1px 5px', flexShrink: 0 },
  attr:     { fontSize: 9, borderRadius: 3, padding: '1px 5px', border: '1px solid', flexShrink: 0 },
  msg:      { padding: '4px 14px', color: theme.textMuted, fontSize: 11 },
  empty:    { padding: '2px 14px 2px 52px', color: theme.textMuted, fontSize: 11, fontStyle: 'italic' as const },
}
