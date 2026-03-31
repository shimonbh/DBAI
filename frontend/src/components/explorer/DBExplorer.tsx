import { useEffect } from 'react'
import { useSchemaStore } from '@/store/schemaStore'
import { useConnectionStore } from '@/store/connectionStore'
import { TableNode } from './TableNode'
import { ViewNode } from './ViewNode'
import { ProcedureNode } from './ProcedureNode'
import { SecurityNode } from './SecurityNode'
import { theme } from '@/theme'

/** Database explorer — one collapsible section per open connection. */
export function DBExplorer() {
  const { profiles, connectedIds, disconnect } = useConnectionStore()
  const { schemas, loadSchema, refreshSchema, clearSchema } = useSchemaStore()

  useEffect(() => {
    connectedIds.forEach(id => {
      if (!schemas[id]) loadSchema(id)
    })
    Object.keys(schemas).forEach(id => {
      if (!connectedIds.has(id)) clearSchema(id)
    })
  }, [connectedIds])  // eslint-disable-line react-hooks/exhaustive-deps

  if (connectedIds.size === 0) {
    return <div style={s.empty}>Connect to a database to explore its schema.</div>
  }

  const handleDisconnect = async (id: string) => {
    await disconnect(id)
    clearSchema(id)
  }

  return (
    <div style={s.container}>
      {[...connectedIds].map(connId => {
        const profile = profiles.find(p => p.id === connId)
        const entry   = schemas[connId]
        return (
          <ConnectionSection
            key={connId}
            connId={connId}
            label={profile?.name ?? connId}
            dbType={profile?.db_type ?? ''}
            entry={entry}
            onDisconnect={() => handleDisconnect(connId)}
            onRefresh={() => refreshSchema(connId)}
          />
        )
      })}
    </div>
  )
}

// ── Connection section ────────────────────────────────────────────────────────

interface SectionProps {
  connId:       string
  label:        string
  dbType:       string
  entry?:       ReturnType<typeof useSchemaStore.getState>['schemas'][string]
  onDisconnect: () => void
  onRefresh:    () => void
}

function ConnectionSection({ connId, label, dbType, entry, onDisconnect, onRefresh }: SectionProps) {
  const { toggleNode } = useSchemaStore()

  const databases     = entry?.databases     ?? []
  const isLoading     = entry?.isLoading     ?? true
  const expandedNodes = entry?.expandedNodes ?? new Set<string>()

  const toggle = (nodeId: string) => toggleNode(connId, nodeId)

  return (
    <div style={s.section}>
      {/* Connection header */}
      <div style={s.connHeader}>
        <span style={s.connDot} />
        <span style={s.connName}>{label}</span>
        <span style={s.dbTypeBadge}>{dbType}</span>
        <button style={s.refreshBtn}  onClick={onRefresh}    title="Refresh schema">↻</button>
        <button style={s.disconnectBtn} onClick={onDisconnect} title="Disconnect and remove">✕</button>
      </div>

      {/* Tree body */}
      {isLoading ? (
        <div style={s.loading}>Loading schema…</div>
      ) : databases.length === 0 ? (
        <div style={s.loading}>No databases found.</div>
      ) : (
        databases.map(db => {
          const dbKey     = `db:${db.name}`
          const tablesKey = `cat:${db.name}:tables`
          const viewsKey  = `cat:${db.name}:views`
          const procsKey  = `cat:${db.name}:procedures`
          const secKey    = `cat:${db.name}:security`
          const isDbExp   = expandedNodes.has(dbKey)

          return (
            <div key={db.name}>
              <div style={s.dbNode} onClick={() => toggle(dbKey)}>
                <span style={s.arrow}>{isDbExp ? '▾' : '▸'}</span>
                <span style={s.dbIcon}>🗄</span>
                <span style={s.dbName}>{db.name}</span>
                <span style={s.count}>{db.tables.length}</span>
              </div>

              {isDbExp && (
                <div>
                  {/* Tables */}
                  <CategoryRow label="Tables" icon="📋" count={db.tables.length}
                    expanded={expandedNodes.has(tablesKey)} onToggle={() => toggle(tablesKey)} />
                  {expandedNodes.has(tablesKey) && db.tables.map(table => (
                    <TableNode key={table.name} table={table} connectionId={connId}
                      nodeId={`table:${db.name}:${table.name}`}
                      expanded={expandedNodes.has(`table:${db.name}:${table.name}`)}
                      onToggle={toggle} />
                  ))}

                  {/* Views */}
                  {(db.views?.length > 0) && (
                    <>
                      <CategoryRow label="Views" icon="👁" count={db.views.length}
                        expanded={expandedNodes.has(viewsKey)} onToggle={() => toggle(viewsKey)} />
                      {expandedNodes.has(viewsKey) && db.views.map(view => (
                        <ViewNode key={view.name} view={view} connectionId={connId}
                          nodeId={`view:${db.name}:${view.name}`}
                          expanded={expandedNodes.has(`view:${db.name}:${view.name}`)}
                          onToggle={toggle} />
                      ))}
                    </>
                  )}

                  {/* Procedures */}
                  {(db.procedures?.length > 0) && (
                    <>
                      <CategoryRow label="Procedures" icon="⚙" count={db.procedures.length}
                        expanded={expandedNodes.has(procsKey)} onToggle={() => toggle(procsKey)} />
                      {expandedNodes.has(procsKey) && db.procedures.map(proc => (
                        <ProcedureNode key={proc.name} proc={proc} connectionId={connId}
                          nodeId={`proc:${db.name}:${proc.name}`}
                          expanded={expandedNodes.has(`proc:${db.name}:${proc.name}`)}
                          onToggle={toggle} />
                      ))}
                    </>
                  )}

                  {/* Security */}
                  <SecurityNode
                    connectionId={connId}
                    database={db.name}
                    expanded={expandedNodes.has(secKey)}
                    onToggle={() => toggle(secKey)}
                  />
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}

// ── Category row ─────────────────────────────────────────────────────────────

interface CategoryRowProps { label: string; icon: string; count: number; expanded: boolean; onToggle: () => void }

function CategoryRow({ label, icon, count, expanded, onToggle }: CategoryRowProps) {
  return (
    <div style={s.catRow} onClick={onToggle}>
      <span style={s.catArrow}>{expanded ? '▾' : '▸'}</span>
      <span style={s.catIcon}>{icon}</span>
      <span style={s.catLabel}>{label}</span>
      <span style={s.count}>{count}</span>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  container:    { display: 'flex' as const, flexDirection: 'column' as const, height: '100%', overflowY: 'auto' as const },
  empty:        { padding: 16, color: theme.textMuted, fontSize: 12, textAlign: 'center' as const },
  section:      { borderBottom: `1px solid ${theme.borderColor}` },
  connHeader:   {
    display: 'flex' as const, alignItems: 'center', gap: 6,
    padding: '6px 8px', background: 'rgba(0,0,0,0.18)',
    borderLeft: `3px solid #5a8a5a`,
  },
  connDot:      { width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: '#a6e3a1' },
  connName:     { fontSize: 12, fontWeight: 600, color: theme.textPrimary, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  dbTypeBadge:  { fontSize: 9, color: theme.textMuted, background: theme.bgSecondary, borderRadius: 3, padding: '1px 5px', flexShrink: 0, textTransform: 'uppercase' as const },
  refreshBtn:   { background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: 14, padding: '0 2px', flexShrink: 0 },
  disconnectBtn:{ background: 'none', border: 'none', color: '#f38ba8', cursor: 'pointer', fontSize: 11, padding: '0 2px', flexShrink: 0, opacity: 0.7 },
  loading:      { padding: '8px 14px', color: theme.textMuted, fontSize: 11 },
  dbNode:   { display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px 5px 14px', cursor: 'pointer', userSelect: 'none' as const },
  arrow:    { fontSize: 10, color: theme.textMuted, width: 12 },
  dbIcon:   { fontSize: 13 },
  dbName:   { fontSize: 13, color: theme.textPrimary, flex: 1 },
  count:    { fontSize: 10, color: theme.textMuted, background: theme.bgPanel, borderRadius: 8, padding: '0 5px' },
  catRow:   { display: 'flex', alignItems: 'center', gap: 5, padding: '4px 12px 4px 28px', cursor: 'pointer', userSelect: 'none' as const },
  catArrow: { fontSize: 9, color: theme.textMuted, width: 10 },
  catIcon:  { fontSize: 11 },
  catLabel: { fontSize: 11, color: theme.textMuted, fontWeight: 600, flex: 1, letterSpacing: 0.3 },
}
