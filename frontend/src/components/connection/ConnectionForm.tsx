import { useState } from 'react'
import type { ConnectionFormData, DBType } from '@/types/connection'
import { theme } from '@/theme'

interface Props {
  initial?: Partial<ConnectionFormData>
  onSave: (data: ConnectionFormData) => Promise<void>
  onCancel: () => void
  onTest?: (data: ConnectionFormData) => Promise<void>
}

const DB_TYPES: { value: DBType; label: string; defaultPort?: number }[] = [
  { value: 'postgresql', label: 'PostgreSQL', defaultPort: 5432 },
  { value: 'mysql',      label: 'MySQL',      defaultPort: 3306 },
  { value: 'mssql',      label: 'SQL Server', defaultPort: 1433 },
  { value: 'sqlite',     label: 'SQLite'      },
]

/** Modal form for creating / editing a connection profile. */
export function ConnectionForm({ initial, onSave, onCancel, onTest }: Props) {
  const [data, setData] = useState<ConnectionFormData>({
    name:     initial?.name     ?? '',
    db_type:  initial?.db_type  ?? 'postgresql',
    host:     initial?.host     ?? 'localhost',
    port:     initial?.port,
    database: initial?.database ?? '',
    username: initial?.username ?? '',
    password: initial?.password ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isSQLite = data.db_type === 'sqlite'

  const set = (key: keyof ConnectionFormData, value: string | number | undefined) =>
    setData(d => ({ ...d, [key]: value }))

  const handleTypeChange = (dt: DBType) => {
    const port = DB_TYPES.find(d => d.value === dt)?.defaultPort
    setData(d => ({
      ...d,
      db_type: dt,
      port,
      host:     dt === 'sqlite' ? '' : (d.host || 'localhost'),
      username: dt === 'sqlite' ? '' : d.username,
      password: dt === 'sqlite' ? '' : d.password,
    }))
  }

  const handleSave = async () => {
    setSaving(true); setError(null)
    try { await onSave(data) }
    catch (e: unknown) { setError((e as Error).message) }
    finally { setSaving(false) }
  }

  const handleTest = async () => {
    if (!onTest) return
    setTesting(true); setTestResult(null)
    try { await onTest(data); setTestResult('✓ Connection successful') }
    catch (e: unknown) { setTestResult(`✗ ${(e as Error).message}`) }
    finally { setTesting(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 380 }}>
      <label style={styles.label}>Name
        <input style={styles.input} value={data.name} onChange={e => set('name', e.target.value)} placeholder="My DB" />
      </label>

      <label style={styles.label}>Database Type
        <select style={styles.input} value={data.db_type} onChange={e => handleTypeChange(e.target.value as DBType)}>
          {DB_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
      </label>

      {isSQLite ? (
        <label style={styles.label}>
          Database File Path
          <input
            style={styles.input}
            value={data.database}
            onChange={e => set('database', e.target.value)}
            placeholder="C:\path\to\database.sqlite  or  :memory:"
          />
          <span style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>
            Use an absolute path to an existing .sqlite / .db file, or :memory: for an in-memory database.
          </span>
        </label>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8 }}>
            <label style={{ ...styles.label, flex: 1 }}>Host
              <input style={styles.input} value={data.host} onChange={e => set('host', e.target.value)} placeholder="localhost" />
            </label>
            <label style={{ ...styles.label, width: 90 }}>Port
              <input style={styles.input} type="number" value={data.port ?? ''} onChange={e => set('port', e.target.value ? Number(e.target.value) : undefined)} />
            </label>
          </div>

          <label style={styles.label}>Database
            <input style={styles.input} value={data.database} onChange={e => set('database', e.target.value)} placeholder="my_database" />
          </label>

          <label style={styles.label}>Username
            <input style={styles.input} value={data.username} onChange={e => set('username', e.target.value)} placeholder="root" />
          </label>

          <label style={styles.label}>Password
            <input style={styles.input} type="password" value={data.password} onChange={e => set('password', e.target.value)} />
          </label>
        </>
      )}

      {testResult && (
        <div style={{ color: testResult.startsWith('✓') ? '#a6e3a1' : '#f38ba8', fontSize: 12 }}>
          {testResult}
        </div>
      )}
      {error && <div style={{ color: '#f38ba8', fontSize: 12 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
        {onTest && (
          <button style={styles.btnSecondary} onClick={handleTest} disabled={testing}>
            {testing ? 'Testing…' : 'Test Connection'}
          </button>
        )}
        <button style={styles.btnSecondary} onClick={onCancel}>Cancel</button>
        <button style={styles.btnPrimary} onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

const styles = {
  label: {
    display: 'flex' as const, flexDirection: 'column' as const,
    gap: 4, fontSize: 12, color: theme.textMuted,
  },
  input: {
    background: theme.bgSecondary, border: `1px solid ${theme.borderColor}`,
    borderRadius: 4, padding: '6px 8px', color: theme.textPrimary,
    fontSize: 13, outline: 'none',
  },
  btnPrimary: {
    background: theme.accentColor, color: '#fff', border: 'none',
    borderRadius: 4, padding: '6px 16px', cursor: 'pointer', fontSize: 13,
  },
  btnSecondary: {
    background: theme.bgPanel, color: theme.textPrimary,
    border: `1px solid ${theme.borderColor}`, borderRadius: 4,
    padding: '6px 14px', cursor: 'pointer', fontSize: 13,
  },
}
