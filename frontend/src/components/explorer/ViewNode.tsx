import type { ViewSchema } from '@/types/schema'
import { useEditorStore } from '@/store/editorStore'
import { useConnectionStore } from '@/store/connectionStore'
import { theme } from '@/theme'

interface Props {
  view: ViewSchema
  nodeId: string
  expanded: boolean
  onToggle: (nodeId: string) => void
}

function quoteIdentifier(name: string, dbType: string): string {
  if (!/[^a-zA-Z0-9_]/.test(name)) return name
  if (dbType === 'mysql') return `\`${name}\``
  if (dbType === 'mssql') return `[${name}]`
  return `"${name}"`  // postgresql, sqlite
}

/** Expandable tree node for a database view. Shows columns when expanded. */
export function ViewNode({ view, nodeId, expanded, onToggle }: Props) {
  const openTab = useEditorStore(s => s.openTab)
  const { profiles, activeConnectionId } = useConnectionStore()
  const dbType = profiles.find(p => p.id === activeConnectionId)?.db_type ?? 'sqlite'

  const insertView = (e: React.MouseEvent) => {
    e.stopPropagation()
    const quoted = quoteIdentifier(view.name, dbType)
    openTab(`SELECT * FROM ${quoted} LIMIT 100`, view.name)
  }

  return (
    <div>
      <div style={styles.row} onClick={() => onToggle(nodeId)}>
        <span style={styles.indent} />
        <span style={styles.arrow}>{expanded ? '▾' : '▸'}</span>
        <span style={styles.icon}>👁</span>
        <span style={styles.name}>{view.name}</span>
        <button
          style={styles.queryBtn}
          onClick={insertView}
          title={`SELECT from ${view.name}`}
        >▶</button>
      </div>

      {expanded && view.columns.map(col => (
        <div key={col.name} style={styles.colRow}>
          <span style={styles.colIndent} />
          <span style={styles.colIcon}>{col.is_pk ? '🔑' : '◦'}</span>
          <span style={styles.colName}>{col.name}</span>
          <span style={styles.colType}>{col.data_type}</span>
        </div>
      ))}
    </div>
  )
}

const styles = {
  row:       { display: 'flex', alignItems: 'center', gap: 4, padding: '4px 12px 4px 24px', cursor: 'pointer', userSelect: 'none' as const },
  indent:    { width: 8 },
  arrow:     { fontSize: 10, color: theme.textMuted, width: 10 },
  icon:      { fontSize: 11 },
  name:      { fontSize: 12, color: theme.textPrimary, flex: 1 },
  queryBtn:  { background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: 10, padding: '0 2px', opacity: 0.7 },
  colRow:    { display: 'flex', alignItems: 'center', gap: 4, padding: '2px 12px 2px 40px' },
  colIndent: { width: 8 },
  colIcon:   { fontSize: 10, width: 14, textAlign: 'center' as const },
  colName:   { fontSize: 11, color: theme.textPrimary, flex: 1 },
  colType:   { fontSize: 10, color: theme.accentColor, background: theme.bgPanel, borderRadius: 3, padding: '0 4px' },
}
