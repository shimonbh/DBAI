import { useEffect } from 'react'
import { useSchemaStore } from '@/store/schemaStore'
import { useConnectionStore } from '@/store/connectionStore'
import { TableNode } from './TableNode'
import { ViewNode } from './ViewNode'
import { ProcedureNode } from './ProcedureNode'
import { theme } from '@/theme'

/** Database tree: databases → Tables / Views / Procedures → items → columns */
export function DBExplorer() {
  const { databases, isLoading, selectedDatabase, selectDatabase,
          expandedNodes, toggleNode, refreshSchema, loadSchema, clearSchema } = useSchemaStore()
  const { activeConnectionId } = useConnectionStore()

  useEffect(() => {
    if (activeConnectionId) loadSchema(activeConnectionId)
    else clearSchema()
  }, [activeConnectionId])

  if (!activeConnectionId) {
    return <div style={styles.empty}>Connect to a database to explore its schema.</div>
  }
  if (isLoading) {
    return <div style={styles.empty}>Loading schema…</div>
  }

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <span style={styles.toolbarTitle}>Schema Explorer</span>
        <button style={styles.refreshBtn} onClick={() => refreshSchema(activeConnectionId)} title="Refresh schema">↻</button>
      </div>

      <div style={styles.tree}>
        {databases.map(db => {
          const dbKey     = `db:${db.name}`
          const tablesKey = `cat:${db.name}:tables`
          const viewsKey  = `cat:${db.name}:views`
          const procsKey  = `cat:${db.name}:procedures`
          const isDbExp   = expandedNodes.has(dbKey)
          const isSelected = selectedDatabase === db.name

          return (
            <div key={db.name}>
              {/* ── Database node ── */}
              <div
                style={{ ...styles.dbNode, background: isSelected ? theme.bgPanel : 'transparent' }}
                onClick={() => { selectDatabase(db.name); toggleNode(dbKey) }}
              >
                <span style={styles.arrow}>{isDbExp ? '▾' : '▸'}</span>
                <span style={styles.dbIcon}>🗄</span>
                <span style={styles.dbName}>{db.name}</span>
                <span style={styles.count}>{db.tables.length}</span>
              </div>

              {isDbExp && (
                <div>
                  {/* ── Tables ── */}
                  <CategoryRow label="Tables" icon="📋" count={db.tables.length}
                    expanded={expandedNodes.has(tablesKey)} onToggle={() => toggleNode(tablesKey)} />
                  {expandedNodes.has(tablesKey) && db.tables.map(table => (
                    <TableNode key={table.name} table={table}
                      nodeId={`table:${db.name}:${table.name}`}
                      expanded={expandedNodes.has(`table:${db.name}:${table.name}`)}
                      onToggle={toggleNode} />
                  ))}

                  {/* ── Views ── */}
                  {(db.views?.length > 0) && (
                    <>
                      <CategoryRow label="Views" icon="👁" count={db.views.length}
                        expanded={expandedNodes.has(viewsKey)} onToggle={() => toggleNode(viewsKey)} />
                      {expandedNodes.has(viewsKey) && db.views.map(view => (
                        <ViewNode key={view.name} view={view}
                          nodeId={`view:${db.name}:${view.name}`}
                          expanded={expandedNodes.has(`view:${db.name}:${view.name}`)}
                          onToggle={toggleNode} />
                      ))}
                    </>
                  )}

                  {/* ── Procedures ── */}
                  {(db.procedures?.length > 0) && (
                    <>
                      <CategoryRow label="Procedures" icon="⚙" count={db.procedures.length}
                        expanded={expandedNodes.has(procsKey)} onToggle={() => toggleNode(procsKey)} />
                      {expandedNodes.has(procsKey) && db.procedures.map(proc => (
                        <ProcedureNode key={proc.name} proc={proc}
                          nodeId={`proc:${db.name}:${proc.name}`}
                          expanded={expandedNodes.has(`proc:${db.name}:${proc.name}`)}
                          onToggle={toggleNode} />
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {!databases.length && <div style={styles.empty}>No databases found.</div>}
      </div>
    </div>
  )
}

// ── Category row ─────────────────────────────────────────────────────────────

interface CategoryRowProps { label: string; icon: string; count: number; expanded: boolean; onToggle: () => void }

function CategoryRow({ label, icon, count, expanded, onToggle }: CategoryRowProps) {
  return (
    <div style={styles.catRow} onClick={onToggle}>
      <span style={styles.catArrow}>{expanded ? '▾' : '▸'}</span>
      <span style={styles.catIcon}>{icon}</span>
      <span style={styles.catLabel}>{label}</span>
      <span style={styles.count}>{count}</span>
    </div>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  container:    { display: 'flex' as const, flexDirection: 'column' as const, height: '100%' },
  toolbar:      { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', borderBottom: `1px solid ${theme.borderColor}` },
  toolbarTitle: { fontSize: 11, color: theme.textMuted, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 1 },
  refreshBtn:   { background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: 16 },
  tree:         { flex: 1, overflowY: 'auto' as const, padding: '4px 0' },
  dbNode:       { display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', cursor: 'pointer', borderRadius: 4, margin: '1px 4px', userSelect: 'none' as const },
  arrow:        { fontSize: 10, color: theme.textMuted, width: 12 },
  dbIcon:       { fontSize: 13 },
  dbName:       { fontSize: 13, color: theme.textPrimary, flex: 1 },
  count:        { fontSize: 10, color: theme.textMuted, background: theme.bgPanel, borderRadius: 8, padding: '0 5px' },
  catRow:       { display: 'flex', alignItems: 'center', gap: 5, padding: '4px 12px 4px 28px', cursor: 'pointer', userSelect: 'none' as const },
  catArrow:     { fontSize: 9, color: theme.textMuted, width: 10 },
  catIcon:      { fontSize: 11 },
  catLabel:     { fontSize: 11, color: theme.textMuted, fontWeight: 600, flex: 1, letterSpacing: 0.3 },
  empty:        { padding: 16, color: theme.textMuted, fontSize: 12, textAlign: 'center' as const },
}
