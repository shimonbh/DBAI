import { useState } from 'react'
import type { ViewSchema } from '@/types/schema'
import { useEditorStore } from '@/store/editorStore'
import { useConnectionStore } from '@/store/connectionStore'
// connectionId comes from props now (passed by DBExplorer)
import { theme } from '@/theme'
import { SqlContextMenu } from './SqlContextMenu'
import { buildSelect, buildInsert, buildUpdate, buildDelete } from './sqlBuilder'

interface Props {
  view: ViewSchema
  connectionId: string
  nodeId: string
  expanded: boolean
  onToggle: (nodeId: string) => void
}

/** Expandable tree node for a database view. Shows columns when expanded. */
export function ViewNode({ view, connectionId, nodeId, expanded, onToggle }: Props) {
  const openTab = useEditorStore(s => s.openTab)
  const { profiles } = useConnectionStore()
  const dbType = profiles.find(p => p.id === connectionId)?.db_type ?? 'sqlite'

  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null)

  const handleArrow = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    setMenuAnchor(prev => prev ? null : e.currentTarget.getBoundingClientRect())
  }

  const open = (sql: string) => openTab(sql, view.name, true, connectionId)

  const menuItems = [
    { label: 'Select', action: () => open(buildSelect(view.name, view.columns, dbType)) },
    { label: 'Insert', action: () => open(buildInsert(view.name, view.columns, dbType)) },
    { label: 'Update', action: () => open(buildUpdate(view.name, view.columns, dbType)) },
    { label: 'Delete', action: () => open(buildDelete(view.name, view.columns, dbType)) },
  ]

  return (
    <div>
      <div style={styles.row} onClick={() => onToggle(nodeId)}>
        <span style={styles.indent} />
        <span style={styles.arrow}>{expanded ? '▾' : '▸'}</span>
        <span style={styles.icon}>👁</span>
        <span style={styles.name}>{view.name}</span>
        <button
          style={styles.queryBtn}
          onClick={handleArrow}
          title={`SQL actions for ${view.name}`}
        >▶</button>
      </div>

      {menuAnchor && (
        <SqlContextMenu
          items={menuItems}
          anchor={menuAnchor}
          onClose={() => setMenuAnchor(null)}
        />
      )}

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
