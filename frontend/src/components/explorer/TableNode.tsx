import { useState } from 'react'
import type { TableSchema, ColumnInfo, IndexInfo, TriggerInfo, ConstraintInfo, ForeignKeyInfo } from '@/types/schema'
import { useEditorStore } from '@/store/editorStore'
import { useConnectionStore } from '@/store/connectionStore'
import { theme } from '@/theme'
import { SqlContextMenu } from './SqlContextMenu'
import { buildSelect, buildInsert, buildUpdate, buildDelete, buildDropTrigger, buildModifyTrigger } from './sqlBuilder'

interface Props {
  table: TableSchema
  connectionId: string
  nodeId: string
  expanded: boolean
  onToggle: (nodeId: string) => void
}

type Section = 'columns' | 'triggers' | 'constraints' | 'keys' | 'indexes'

// ── Sub-row renderers ────────────────────────────────────────────────────────

function ColumnRow({ col }: { col: ColumnInfo }) {
  return (
    <div style={s.itemRow}>
      <span style={s.itemIcon}>{col.is_pk ? '🔑' : '◦'}</span>
      <span style={s.itemName}>{col.name}</span>
      <span style={s.itemBadge}>{col.data_type}</span>
      {!col.nullable && <span style={s.notNull}>NOT NULL</span>}
    </div>
  )
}

function IndexRow({ idx }: { idx: IndexInfo }) {
  return (
    <div style={s.itemRow}>
      <span style={s.itemIcon}>{idx.is_primary ? '🔑' : idx.is_unique ? '◈' : '◇'}</span>
      <span style={s.itemName}>{idx.name}</span>
      <span style={s.itemMuted}>{idx.columns}</span>
      {idx.is_unique && !idx.is_primary && <span style={s.itemBadge}>UNIQUE</span>}
    </div>
  )
}

function TriggerRow({
  tr, table, dbType, onOpen,
}: { tr: TriggerInfo; table: string; dbType: string; onOpen: (sql: string, title: string) => void }) {
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null)

  const handleBtn = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    setMenuAnchor(prev => prev ? null : rect)
  }

  const menuItems = [
    { label: 'Modify', action: () => onOpen(buildModifyTrigger(tr, table, dbType), `${tr.name} (edit)`) },
    { label: 'Delete', action: () => onOpen(buildDropTrigger(tr.name, table, dbType), `Drop ${tr.name}`) },
  ]

  return (
    <div style={s.itemRow}>
      <span style={s.itemIcon}>⚡</span>
      <span style={s.itemName}>{tr.name}</span>
      <span style={s.itemBadge}>{tr.timing} {tr.event}</span>
      <button style={s.miniBtn} onClick={handleBtn} title="Modify / Delete">▶</button>
      {menuAnchor && (
        <SqlContextMenu items={menuItems} anchor={menuAnchor} onClose={() => setMenuAnchor(null)} />
      )}
    </div>
  )
}

function ConstraintRow({ con }: { con: ConstraintInfo }) {
  return (
    <div style={s.itemRow}>
      <span style={s.itemIcon}>✔</span>
      <span style={s.itemName}>{con.name}</span>
      <span style={s.itemMuted} title={con.definition}>{con.definition}</span>
    </div>
  )
}

function ForeignKeyRow({ fk }: { fk: ForeignKeyInfo }) {
  return (
    <div style={s.itemRow}>
      <span style={s.itemIcon}>🔗</span>
      <span style={s.itemName}>{fk.columns}</span>
      <span style={s.itemMuted}>→ {fk.ref_table}.{fk.ref_columns}</span>
    </div>
  )
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({
  label, icon, count, open, onToggle,
}: { label: string; icon: string; count: number; open: boolean; onToggle: () => void }) {
  const hasItems = count > 0
  return (
    <div
      style={{ ...s.sectionRow, opacity: hasItems ? 1 : 0.45, cursor: hasItems ? 'pointer' : 'default' }}
      onClick={hasItems ? onToggle : undefined}
    >
      <span style={s.sectionArrow}>{hasItems ? (open ? '▾' : '▸') : ' '}</span>
      <span style={s.sectionIcon}>{icon}</span>
      <span style={s.sectionLabel}>{label}</span>
      <span style={s.sectionCount}>{count}</span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function TableNode({ table, connectionId, nodeId, expanded, onToggle }: Props) {
  const openTab = useEditorStore(s => s.openTab)
  const { profiles } = useConnectionStore()
  const dbType = profiles.find(p => p.id === connectionId)?.db_type ?? 'sqlite'

  const [menuAnchor, setMenuAnchor]     = useState<DOMRect | null>(null)
  const [openSections, setOpenSections] = useState<Set<Section>>(new Set(['columns']))

  const toggleSection = (sec: Section) =>
    setOpenSections(prev => {
      const next = new Set(prev)
      next.has(sec) ? next.delete(sec) : next.add(sec)
      return next
    })

  const handleArrow = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    setMenuAnchor(prev => prev ? null : rect)
  }

  const open = (sql: string, title = table.name) => openTab(sql, title, true, connectionId)

  const menuItems = [
    { label: 'Select', action: () => open(buildSelect(table.name, table.columns, dbType)) },
    { label: 'Insert', action: () => open(buildInsert(table.name, table.columns, dbType)) },
    { label: 'Update', action: () => open(buildUpdate(table.name, table.columns, dbType)) },
    { label: 'Delete', action: () => open(buildDelete(table.name, table.columns, dbType)) },
  ]

  const triggers    = table.triggers     ?? []
  const constraints = table.constraints  ?? []
  const foreignKeys = table.foreign_keys ?? []
  const indexes     = table.indexes      ?? []

  return (
    <div>
      {/* Table header row */}
      <div style={s.tableRow} onClick={() => onToggle(nodeId)}>
        <span style={s.indent} />
        <span style={s.arrow}>{expanded ? '▾' : '▸'}</span>
        <span style={s.tableIcon}>📋</span>
        <span style={s.tableName}>{table.name}</span>
        <button style={s.queryBtn} onClick={handleArrow} title={`SQL actions for ${table.name}`}>▶</button>
      </div>

      {menuAnchor && (
        <SqlContextMenu items={menuItems} anchor={menuAnchor} onClose={() => setMenuAnchor(null)} />
      )}

      {/* Expanded section groups */}
      {expanded && (
        <div>
          <SectionHeader label="Columns" icon="≡" count={table.columns.length}
            open={openSections.has('columns')} onToggle={() => toggleSection('columns')} />
          {openSections.has('columns') && table.columns.map(col => (
            <ColumnRow key={col.name} col={col} />
          ))}

          <SectionHeader label="Triggers" icon="⚡" count={triggers.length}
            open={openSections.has('triggers')} onToggle={() => toggleSection('triggers')} />
          {openSections.has('triggers') && triggers.map(tr => (
            <TriggerRow key={tr.name} tr={tr} table={table.name} dbType={dbType} onOpen={open} />
          ))}

          <SectionHeader label="Constraints" icon="✔" count={constraints.length}
            open={openSections.has('constraints')} onToggle={() => toggleSection('constraints')} />
          {openSections.has('constraints') && constraints.map(con => (
            <ConstraintRow key={con.name} con={con} />
          ))}

          <SectionHeader label="Keys" icon="🔗" count={foreignKeys.length}
            open={openSections.has('keys')} onToggle={() => toggleSection('keys')} />
          {openSections.has('keys') && foreignKeys.map(fk => (
            <ForeignKeyRow key={fk.name} fk={fk} />
          ))}

          <SectionHeader label="Indexes" icon="◈" count={indexes.length}
            open={openSections.has('indexes')} onToggle={() => toggleSection('indexes')} />
          {openSections.has('indexes') && indexes.map(idx => (
            <IndexRow key={idx.name} idx={idx} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  tableRow:    { display: 'flex', alignItems: 'center', gap: 4, padding: '4px 12px 4px 24px', cursor: 'pointer', userSelect: 'none' as const },
  indent:      { width: 8 },
  arrow:       { fontSize: 10, color: theme.textMuted, width: 10 },
  tableIcon:   { fontSize: 11 },
  tableName:   { fontSize: 12, color: theme.textPrimary, flex: 1 },
  queryBtn:    { background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: 10, padding: '0 2px', opacity: 0.7 },

  sectionRow:  { display: 'flex', alignItems: 'center', gap: 4, padding: '3px 12px 3px 36px', userSelect: 'none' as const },
  sectionArrow:{ fontSize: 9, color: theme.textMuted, width: 10 },
  sectionIcon: { fontSize: 10, width: 14, textAlign: 'center' as const },
  sectionLabel:{ fontSize: 11, color: theme.textMuted, flex: 1 },
  sectionCount:{ fontSize: 10, color: theme.textMuted, background: theme.bgSecondary, borderRadius: 8, padding: '0 5px', minWidth: 16, textAlign: 'center' as const },

  itemRow:   { display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px 2px 54px', position: 'relative' as const },
  itemIcon:  { fontSize: 10, width: 14, textAlign: 'center' as const },
  itemName:  { fontSize: 11, color: theme.textPrimary, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  itemBadge: { fontSize: 10, color: theme.accentColor, background: theme.bgPanel, borderRadius: 3, padding: '0 4px', flexShrink: 0 },
  itemMuted: { fontSize: 10, color: theme.textMuted, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  notNull:   { fontSize: 9, color: '#f38ba8', background: '#2b1010', borderRadius: 3, padding: '0 3px', flexShrink: 0 },
  miniBtn:   { background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: 9, padding: '0 2px', opacity: 0.6, flexShrink: 0 },
}
