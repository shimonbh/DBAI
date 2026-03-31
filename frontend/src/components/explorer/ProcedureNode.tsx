import { useState } from 'react'
import type { ProcedureSchema } from '@/types/schema'
import { useEditorStore } from '@/store/editorStore'
import { useConnectionStore } from '@/store/connectionStore'
import { theme } from '@/theme'
import { SqlContextMenu } from './SqlContextMenu'

interface Props {
  proc: ProcedureSchema
  connectionId: string
  nodeId: string
  expanded: boolean
  onToggle: (nodeId: string) => void
}

/** Tree node for a stored procedure — click ▶ to open an action menu. */
export function ProcedureNode({ proc, connectionId }: Props) {
  const openTab = useEditorStore(s => s.openTab)
  const { profiles } = useConnectionStore()
  const dbType = profiles.find(p => p.id === connectionId)?.db_type ?? 'mysql'

  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null)

  const handleArrow = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    setMenuAnchor(prev => prev ? null : rect)
  }

  // ── SQL builders ─────────────────────────────────────────────────────────

  const buildParamList = () => {
    const params = proc.parameters
    if (!params || params.length === 0) return ''
    return params
      .map(p => `${p.name}_${p.data_type.toLowerCase().replace(/\s+/g, '_')}`)
      .join(', ')
  }

  const buildExecute = (): string => {
    const paramList = buildParamList()
    if (dbType === 'mssql') {
      return paramList ? `EXEC ${proc.name} ${paramList}` : `EXEC ${proc.name}`
    }
    return `CALL ${proc.name}(${paramList})`
  }

  const buildModify = (): string => {
    if (proc.definition) {
      // Strip leading CREATE and replace with CREATE OR REPLACE / ALTER
      const def = proc.definition.trim()
      if (dbType === 'postgresql') {
        return def.replace(/^CREATE(\s+OR\s+REPLACE)?\s+/i, 'CREATE OR REPLACE ')
      }
      if (dbType === 'mssql') {
        return def.replace(/^CREATE\s+/i, 'ALTER ')
      }
      // MySQL: show original CREATE — user edits then runs DROP + CREATE
      return def
    }
    // Fallback skeleton
    if (dbType === 'mssql') {
      return `ALTER PROCEDURE ${proc.name}\nAS\nBEGIN\n  -- TODO\nEND`
    }
    if (dbType === 'postgresql') {
      return `CREATE OR REPLACE PROCEDURE ${proc.name}()\nLANGUAGE plpgsql\nAS $$\nBEGIN\n  -- TODO\nEND;\n$$;`
    }
    return `-- Drop and recreate to modify in MySQL\nDROP PROCEDURE IF EXISTS ${proc.name};\n\nDELIMITER $$\nCREATE PROCEDURE ${proc.name}()\nBEGIN\n  -- TODO\nEND$$\nDELIMITER ;`
  }

  const buildDrop = (): string => {
    if (dbType === 'mssql') {
      return `DROP PROCEDURE IF EXISTS ${proc.name}`
    }
    return `DROP PROCEDURE IF EXISTS ${proc.name};`
  }

  // ── Menu items ───────────────────────────────────────────────────────────

  const menuItems = [
    { label: 'Execute', action: () => openTab(buildExecute(), proc.name,            true, connectionId) },
    { label: 'Modify',  action: () => openTab(buildModify(),  `${proc.name} (edit)`, true, connectionId) },
    { label: 'Delete',  action: () => openTab(buildDrop(),    `Drop ${proc.name}`,   true, connectionId) },
  ]

  return (
    <div style={styles.row}>
      <span style={styles.indent} />
      <span style={styles.spacer} />
      <span style={styles.icon}>⚙</span>
      <span style={styles.name}>{proc.name}</span>
      <button
        style={styles.queryBtn}
        onClick={handleArrow}
        title={`Actions for ${proc.name}`}
      >▶</button>

      {menuAnchor && (
        <SqlContextMenu
          items={menuItems}
          anchor={menuAnchor}
          onClose={() => setMenuAnchor(null)}
        />
      )}
    </div>
  )
}

const styles = {
  row:      { display: 'flex', alignItems: 'center', gap: 4, padding: '4px 12px 4px 24px', cursor: 'default', userSelect: 'none' as const, position: 'relative' as const },
  indent:   { width: 8 },
  spacer:   { width: 10 },
  icon:     { fontSize: 11 },
  name:     { fontSize: 12, color: theme.textPrimary, flex: 1 },
  queryBtn: { background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: 10, padding: '0 2px', opacity: 0.7 },
}
