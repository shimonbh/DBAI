import { useState, useMemo, useEffect, useRef } from 'react'
import type { SavedQuery } from '@/types/query'
import { extractTables } from '@/utils/sqlTables'
import { theme } from '@/theme'
import { useQueryStore } from '@/store/queryStore'


// ── Types ─────────────────────────────────────────────────────────────────────
interface QueryRef  { id: string; kind: 'query';  queryId: string }
interface FolderNode { id: string; kind: 'folder'; name: string; children: ProjectNode[] }
type ProjectNode = FolderNode | QueryRef

interface Project { id: string; name: string; children: ProjectNode[] }

// Mirror of what main.ts ExportNode expects
interface ExportNode {
  type: 'file' | 'folder'
  name: string
  content?: string
  children?: ExportNode[]
}

// Mirror of what main.ts ImportNode returns
interface ImportFolderNode {
  kind: 'file' | 'folder'
  name: string
  content?: string
  children?: ImportFolderNode[]
}

type Modal =
  | { type: 'name'; title: string; value: string; onConfirm: (n: string) => void }
  | { type: 'load-queries'; projectId: string; parentId: string | null }
  | { type: 'folder-structure'; projectId: string; parentId: string | null; groups: QGroup[] }
  | null

interface QGroup { key: string; queries: SavedQuery[] }

// ── Storage ───────────────────────────────────────────────────────────────────
const LS_KEY = 'dbai_projects'
const uid = () => Math.random().toString(36).slice(2, 9)
const loadPS  = (): Project[] => { try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') } catch { return [] } }
const savePS  = (ps: Project[]) => localStorage.setItem(LS_KEY, JSON.stringify(ps))

// ── Tree helpers (pure) ───────────────────────────────────────────────────────
function insertInto(nodes: ProjectNode[], parentId: string | null, child: ProjectNode): ProjectNode[] {
  if (parentId === null) return [...nodes, child]
  return nodes.map(n => {
    if (n.kind !== 'folder') return n
    if (n.id === parentId) return { ...n, children: [...n.children, child] }
    return { ...n, children: insertInto(n.children, parentId, child) }
  })
}
function removeById(nodes: ProjectNode[], id: string): ProjectNode[] {
  return nodes.filter(n => n.id !== id).map(n =>
    n.kind === 'folder' ? { ...n, children: removeById(n.children, id) } : n
  )
}
function renameById(nodes: ProjectNode[], id: string, name: string): ProjectNode[] {
  return nodes.map(n => {
    if (n.id === id && n.kind === 'folder') return { ...n, name }
    if (n.kind === 'folder') return { ...n, children: renameById(n.children, id, name) }
    return n
  })
}
function countRefs(nodes: ProjectNode[]): number {
  return nodes.reduce((s, n) => s + (n.kind === 'query' ? 1 : countRefs(n.children)), 0)
}

// ── ProjectsSection ───────────────────────────────────────────────────────────
export function ProjectsSection({ saved, onOpen }: {
  saved: SavedQuery[]
  onOpen: (sql: string, name: string) => void
}) {
  const [projects, setProjectsRaw] = useState<Project[]>(loadPS)
  const [modal, setModal]  = useState<Modal>(null)
  const [open,  setOpen]   = useState(true)
  const saveQuery = useQueryStore(s => s.saveQuery)

  const persist = (ps: Project[]) => { setProjectsRaw(ps); savePS(ps) }

  // ── Project CRUD ─────────────────────────────────────────────────────────
  const addProject = (name: string) =>
    persist([...projects, { id: uid(), name, children: [] }])

  const deleteProject = (id: string) =>
    persist(projects.filter(p => p.id !== id))

  const renameProject = (id: string, name: string) =>
    persist(projects.map(p => p.id === id ? { ...p, name } : p))

  // ── Node CRUD ─────────────────────────────────────────────────────────────
  const addFolder = (projectId: string, parentId: string | null, name: string) => {
    const node: FolderNode = { id: uid(), kind: 'folder', name, children: [] }
    persist(projects.map(p =>
      p.id !== projectId ? p : { ...p, children: insertInto(p.children, parentId, node) }
    ))
  }

  const removeNode = (projectId: string, nodeId: string) =>
    persist(projects.map(p =>
      p.id !== projectId ? p : { ...p, children: removeById(p.children, nodeId) }
    ))

  const renameFolderNode = (projectId: string, nodeId: string, name: string) =>
    persist(projects.map(p =>
      p.id !== projectId ? p : { ...p, children: renameById(p.children, nodeId, name) }
    ))

  // Apply query selections — flat or with folder wrappers
  const applyQueryRefs = (
    projectId: string,
    parentId: string | null,
    groups: QGroup[],
    preserveFolders: boolean,
  ) => {
    persist(projects.map(p => {
      if (p.id !== projectId) return p
      let children = [...p.children]
      // Dedupe: each SavedQuery appears only once
      const placed = new Set<string>()
      for (const g of groups) {
        const unique = g.queries.filter(q => !placed.has(q.id))
        unique.forEach(q => placed.add(q.id))
        if (!unique.length) continue

        if (preserveFolders && g.key !== '\x00other') {
          const folder: FolderNode = {
            id: uid(), kind: 'folder', name: g.key,
            children: unique.map(q => ({ id: uid(), kind: 'query' as const, queryId: q.id })),
          }
          children = insertInto(children, parentId, folder) as ProjectNode[]
        } else {
          for (const q of unique) {
            const ref: QueryRef = { id: uid(), kind: 'query', queryId: q.id }
            children = insertInto(children, parentId, ref) as ProjectNode[]
          }
        }
      }
      return { ...p, children }
    }))
  }

  // Called from QueryPickerModal — always add flat, no folder-structure popup
  const handleLoaded = (projectId: string, parentId: string | null, ids: string[]) => {
    const qs = saved.filter(q => ids.includes(q.id))
    // Dedupe: each query added once
    const seen = new Set<string>()
    const unique = qs.filter(q => { if (seen.has(q.id)) return false; seen.add(q.id); return true })
    applyQueryRefs(projectId, parentId, [{ key: '\x00other', queries: unique }], false)
    setModal(null)
  }

  // ── Shared prompt helper ──────────────────────────────────────────────────
  const promptName = (title: string, value: string, onConfirm: (n: string) => void) =>
    setModal({ type: 'name', title, value, onConfirm })

  // ── Export ────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ ok: boolean; msg: string; openPath?: string } | null>(null)

  const sanitize = (name: string) => name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim() || 'query'

  function buildExportNodes(nodes: ProjectNode[]): ExportNode[] {
    const out: ExportNode[] = []
    for (const node of nodes) {
      if (node.kind === 'folder') {
        out.push({ type: 'folder', name: sanitize(node.name), children: buildExportNodes(node.children) })
      } else {
        const q = saved.find(s => s.id === node.queryId)
        if (q) out.push({ type: 'file', name: sanitize(q.name), content: q.sql_text })
      }
    }
    return out
  }

  const handleExport = async (project: Project) => {
    if (!window.electronAPI) {
      setToast({ ok: false, msg: 'Export is only available in the desktop app.' })
      setTimeout(() => setToast(null), 3500)
      return
    }
    const dest = await window.electronAPI.selectFolder()
    if (!dest) return

    // Always preserve the project's own folder structure exactly
    const tree: ExportNode[] = [{
      type: 'folder',
      name: sanitize(project.name),
      children: buildExportNodes(project.children),
    }]
    const result = await window.electronAPI.exportProject(dest, tree)
    if (result.ok) {
      setToast({ ok: true, msg: `Exported → ${sanitize(project.name)}`, openPath: result.exportedPath })
      setTimeout(() => setToast(null), 8000)
    } else {
      setToast({ ok: false, msg: result.error ?? 'Export failed.' })
      setTimeout(() => setToast(null), 4000)
    }
  }

  // ── Import ────────────────────────────────────────────────────────────────

  /** Recursively save ImportFolderNode[] as queries + build a ProjectNode tree. */
  const buildImportTree = async (nodes: ImportFolderNode[]): Promise<ProjectNode[]> => {
    const out: ProjectNode[] = []
    for (const node of nodes) {
      if (node.kind === 'file') {
        try {
          const q = await saveQuery({ name: node.name, sql_text: node.content ?? '', connection_id: null })
          out.push({ id: uid(), kind: 'query', queryId: q.id })
        } catch { /* skip unreadable files */ }
      } else {
        const children = await buildImportTree(node.children ?? [])
        out.push({ id: uid(), kind: 'folder', name: node.name, children })
      }
    }
    return out
  }

  /** Insert a list of ProjectNodes under parentId (or at root if null). */
  const insertNodes = (projectId: string, parentId: string | null, nodes: ProjectNode[]) => {
    persist(projects.map(p => {
      if (p.id !== projectId) return p
      let children = [...p.children]
      for (const node of nodes) children = insertInto(children, parentId, node) as ProjectNode[]
      return { ...p, children }
    }))
  }

  /** Import .sql files via native file picker dialog. */
  const handleImportFiles = async (projectId: string, parentId: string | null) => {
    if (!window.electronAPI?.importSqlFiles) {
      setToast({ ok: false, msg: 'Import is only available in the desktop app.' })
      setTimeout(() => setToast(null), 3500)
      return
    }
    const files = await window.electronAPI.importSqlFiles()
    if (!files || !files.length) return

    setToast({ ok: true, msg: 'Importing…' })
    const importNodes: ImportFolderNode[] = files.map(f => ({ kind: 'file', name: f.name, content: f.content }))
    const nodes = await buildImportTree(importNodes)
    if (nodes.length) insertNodes(projectId, parentId, nodes)
    setToast({ ok: true, msg: `Imported ${nodes.length} quer${nodes.length === 1 ? 'y' : 'ies'}.` })
    setTimeout(() => setToast(null), 3000)
  }

  /** Import a folder recursively via native folder picker dialog. */
  const handleImportFolder = async (projectId: string, parentId: string | null) => {
    if (!window.electronAPI) {
      setToast({ ok: false, msg: 'Import is only available in the desktop app.' })
      setTimeout(() => setToast(null), 3500)
      return
    }
    const folderPath = await window.electronAPI.selectFolder()
    if (!folderPath) return

    const result = await window.electronAPI.readFolder(folderPath)
    if (!result.ok || !result.nodes) {
      setToast({ ok: false, msg: result.error ?? 'Failed to read folder.' })
      setTimeout(() => setToast(null), 3500)
      return
    }

    setToast({ ok: true, msg: 'Importing…' })
    const nodes = await buildImportTree(result.nodes)
    if (nodes.length) insertNodes(projectId, parentId, nodes)
    const count = nodes.reduce((s, n) => s + (n.kind === 'query' ? 1 : countRefs((n as FolderNode).children)), 0)
    setToast({ ok: true, msg: `Imported ${count} quer${count === 1 ? 'y' : 'ies'} from folder.` })
    setTimeout(() => setToast(null), 3000)
  }

  /** Handle anything dropped onto a project or folder row:
   *  - saved query dragged from Query Library (application/dbai-query-id)
   *  - editor tab dragged from right panel   (application/dbai-tab-sql)
   *  - OS .sql files / folders               (DataTransfer files API)
   */
  const handleFileDrop = async (
    e: React.DragEvent,
    projectId: string,
    parentId: string | null,
  ) => {
    e.preventDefault()
    e.stopPropagation()

    // ── Internal: saved query from Query Library ──────────────────────────────
    const queryId = e.dataTransfer.getData('application/dbai-query-id')
    if (queryId) {
      insertNodes(projectId, parentId, [{ id: uid(), kind: 'query', queryId }])
      setToast({ ok: true, msg: 'Query added to project.' })
      setTimeout(() => setToast(null), 2500)
      return
    }

    // ── Internal: editor tab from right panel ─────────────────────────────────
    const tabRaw = e.dataTransfer.getData('application/dbai-tab-sql')
    if (tabRaw) {
      try {
        const { sql, title } = JSON.parse(tabRaw) as { sql: string; title: string }
        setToast({ ok: true, msg: 'Saving…' })
        const q = await saveQuery({ name: title, sql_text: sql, connection_id: null })
        insertNodes(projectId, parentId, [{ id: uid(), kind: 'query', queryId: q.id }])
        setToast({ ok: true, msg: `"${title}" added to project.` })
      } catch {
        setToast({ ok: false, msg: 'Failed to save tab as query.' })
      }
      setTimeout(() => setToast(null), 3000)
      return
    }

    // ── External: OS files / folders ──────────────────────────────────────────
    const sqlFiles: ImportFolderNode[] = []
    const folderPaths: string[] = []

    // Use DataTransferItemList + webkitGetAsEntry to reliably distinguish
    // files from directories. In Electron, getAsFile() works for both —
    // directories get a File object whose non-standard `.path` property
    // holds the real filesystem path.
    const items = Array.from(e.dataTransfer.items)
    for (const item of items) {
      if (item.kind !== 'file') continue
      const entry = item.webkitGetAsEntry?.()
      const file  = item.getAsFile() as (File & { path?: string }) | null

      if (entry?.isDirectory) {
        // For folders, prefer the Electron-specific .path on the File object;
        // fall back to entry.fullPath (virtual path, less useful but better than nothing)
        const fp = file?.path ?? (entry as { fullPath?: string }).fullPath
        if (fp && window.electronAPI?.readFolder) folderPaths.push(fp)
      } else if (entry?.isFile && file) {
        if (/\.(sql|txt)$/i.test(file.name)) {
          try {
            const content = await file.text()
            sqlFiles.push({ kind: 'file', name: file.name.replace(/\.(sql|txt)$/i, ''), content })
          } catch { /* skip unreadable */ }
        }
      }
    }

    const allNodes: ProjectNode[] = []

    if (sqlFiles.length) {
      allNodes.push(...await buildImportTree(sqlFiles))
    }

    for (const fp of folderPaths) {
      const result = await window.electronAPI!.readFolder(fp)
      if (result.ok && result.nodes) {
        const children = await buildImportTree(result.nodes)
        const folderName = fp.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? 'Imported'
        allNodes.push({ id: uid(), kind: 'folder', name: folderName, children })
      }
    }

    if (allNodes.length) {
      insertNodes(projectId, parentId, allNodes)
      const count = allNodes.reduce((s, n) =>
        s + (n.kind === 'query' ? 1 : countRefs((n as FolderNode).children)), 0)
      setToast({ ok: true, msg: `Imported ${count} quer${count === 1 ? 'y' : 'ies'}.` })
      setTimeout(() => setToast(null), 3000)
    }
  }

  const totalRefs = projects.reduce((s, p) => s + countRefs(p.children), 0)

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Section header ── */}
      <div style={pS.sectionHeader} onClick={() => setOpen(v => !v)}>
        <span style={pS.arrow}>{open ? '▾' : '▸'}</span>
        <span style={pS.sectionLabel}>Projects</span>
        {totalRefs > 0 && <span style={pS.badge}>{totalRefs}</span>}
        <button
          style={pS.addBtn}
          title="New project"
          onClick={e => { e.stopPropagation(); promptName('New Project', '', addProject) }}
        >＋</button>
      </div>

      {open && (
        <div style={{ paddingLeft: 10 }}>
          {projects.length === 0 && (
            <div style={pS.empty}>No projects yet — click <strong>＋</strong> to create one.</div>
          )}
          {projects.map(project => (
            <ProjectView
              key={project.id}
              project={project}
              saved={saved}
              onOpen={onOpen}
              onDelete={() => deleteProject(project.id)}
              onRename={() => promptName('Rename Project', project.name, n => renameProject(project.id, n))}
              onAddFolder={() => promptName('New Folder', '', n => addFolder(project.id, null, n))}
              onLoadQueries={() => setModal({ type: 'load-queries', projectId: project.id, parentId: null })}
              onAddSubFolder={pid => promptName('New Folder', '', n => addFolder(project.id, pid, n))}
              onLoadQueriesInFolder={pid => setModal({ type: 'load-queries', projectId: project.id, parentId: pid })}
              onRemoveNode={nid => removeNode(project.id, nid)}
              onRenameFolder={(nid, cur) => promptName('Rename Folder', cur, n => renameFolderNode(project.id, nid, n))}
              onExport={() => handleExport(project)}
              onImportFiles={() => handleImportFiles(project.id, null)}
              onImportFolder={() => handleImportFolder(project.id, null)}
              onImportFilesInFolder={pid => handleImportFiles(project.id, pid)}
              onImportFolderInFolder={pid => handleImportFolder(project.id, pid)}
              onDropFiles={(e, pid) => handleFileDrop(e, project.id, pid)}
            />
          ))}
        </div>
      )}

      {/* ── Modals ── */}
      {modal?.type === 'name' && (
        <NameModal
          title={modal.title} defaultValue={modal.value}
          onConfirm={n => { modal.onConfirm(n); setModal(null) }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'load-queries' && (
        <QueryPickerModal
          saved={saved}
          onConfirm={ids => handleLoaded(modal.projectId, modal.parentId, ids)}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'folder-structure' && (
        <FolderStructureModal
          groups={modal.groups}
          onConfirm={preserve => {
            applyQueryRefs(modal.projectId, modal.parentId, modal.groups, preserve)
            setModal(null)
          }}
          onClose={() => setModal(null)}
        />
      )}

      {/* ── Export toast ── */}
      {toast && (
        <div
          onClick={toast.openPath
            ? () => { window.electronAPI?.openPath(toast.openPath!); setToast(null) }
            : undefined}
          style={{
            position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
            background: toast.ok ? '#1e3a2f' : '#3a1e1e',
            border: `1px solid ${toast.ok ? '#a6e3a1' : '#f38ba8'}`,
            borderRadius: 8, padding: '10px 18px', zIndex: 9999,
            color: toast.ok ? '#a6e3a1' : '#f38ba8', fontSize: 12,
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)', maxWidth: 380,
            cursor: toast.openPath ? 'pointer' : 'default',
            userSelect: 'none' as const,
          }}
        >
          <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {toast.ok ? '✓ ' : '✗ '}{toast.msg}
          </div>
          {toast.openPath && (
            <div style={{ fontSize: 10, marginTop: 4, opacity: 0.75 }}>
              Click to open in Explorer
            </div>
          )}
        </div>
      )}
    </>
  )
}

// ── DropdownMenu ──────────────────────────────────────────────────────────────
interface MenuItem { label: string; icon: string; danger?: boolean; divider?: boolean; onClick: () => void }

function DropdownMenu({ items, anchorRef, onClose }: {
  items: MenuItem[]
  anchorRef: React.RefObject<HTMLButtonElement>
  onClose: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState<React.CSSProperties>({ visibility: 'hidden' })
  const rect = anchorRef.current?.getBoundingClientRect()

  // After first paint: measure the menu and flip above if it overflows the viewport
  useEffect(() => {
    if (!menuRef.current || !rect) return
    const menuH = menuRef.current.offsetHeight
    const spaceBelow = window.innerHeight - rect.bottom - 6
    const top = spaceBelow >= menuH
      ? rect.bottom + 3                   // enough room below → show below
      : Math.max(4, rect.top - menuH - 3) // not enough → show above
    setStyle({ visibility: 'visible', top, left: rect.left })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as Element)?.closest?.('[data-dropdown-menu]')) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  if (!rect) return null
  return (
    <div ref={menuRef} data-dropdown-menu style={{
      position: 'fixed', top: rect.bottom + 3, left: rect.left,
      background: theme.bgPanel, border: `1px solid ${theme.borderColor}`,
      borderRadius: 7, boxShadow: '0 6px 20px rgba(0,0,0,0.45)',
      zIndex: 5000, minWidth: 168, overflow: 'hidden',
      ...style,
    }}>
      {items.map((item, i) =>
        item.divider
          ? <div key={i} style={{ height: 1, background: theme.borderColor, margin: '3px 0' }} />
          : <DropdownItem key={i} item={item} onClose={onClose} />
      )}
    </div>
  )
}

function DropdownItem({ item, onClose }: { item: MenuItem; onClose: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px',
        fontSize: 12, cursor: 'pointer',
        color: item.danger ? '#f38ba8' : theme.textPrimary,
        background: hov ? theme.bgSecondary : 'transparent' }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      onClick={() => { item.onClick(); onClose() }}
    >
      <span style={{ width: 14, textAlign: 'center' }}>{item.icon}</span>
      {item.label}
    </div>
  )
}

// ── ProjectView ───────────────────────────────────────────────────────────────
function ProjectView({ project, saved, onOpen, onDelete, onRename, onAddFolder, onLoadQueries,
  onAddSubFolder, onLoadQueriesInFolder, onRemoveNode, onRenameFolder, onExport,
  onImportFiles, onImportFolder, onImportFilesInFolder, onImportFolderInFolder, onDropFiles }: {
  project: Project; saved: SavedQuery[]
  onOpen: (sql: string, name: string) => void
  onDelete: () => void; onRename: () => void
  onAddFolder: () => void; onLoadQueries: () => void
  onAddSubFolder: (parentId: string) => void
  onLoadQueriesInFolder: (parentId: string) => void
  onRemoveNode: (nodeId: string) => void
  onRenameFolder: (nodeId: string, cur: string) => void
  onExport: () => void
  onImportFiles: () => void
  onImportFolder: () => void
  onImportFilesInFolder: (parentId: string) => void
  onImportFolderInFolder: (parentId: string) => void
  onDropFiles: (e: React.DragEvent, parentId: string | null) => void
}) {
  const [isOpen, setIsOpen]     = useState(true)
  const [hovered, setHovered]   = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const menuBtnRef = useRef<HTMLButtonElement>(null)
  const count = countRefs(project.children)

  return (
    <div>
      <div
        style={{
          ...pS.projectRow,
          background: dragOver ? `${theme.accentColor}22` : hovered ? theme.bgSecondary : theme.bgPanel,
          outline: dragOver ? `2px dashed ${theme.accentColor}` : undefined,
          outlineOffset: dragOver ? -2 : undefined,
        }}
        onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
        onClick={() => setIsOpen(v => !v)}
        onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { setDragOver(false); onDropFiles(e, null) }}
      >
        <span style={pS.arrow}>{isOpen ? '▾' : '▸'}</span>
        <span style={pS.projectName}>{project.name}</span>
        <span style={pS.badge}>{count}</span>
        {(hovered || menuOpen) && (
          <button ref={menuBtnRef} style={pS.menuBtn}
            onClick={e => { e.stopPropagation(); setMenuOpen(v => !v) }}>＋</button>
        )}
      </div>

      {menuOpen && (
        <DropdownMenu anchorRef={menuBtnRef} onClose={() => setMenuOpen(false)} items={[
          { icon: '📁', label: 'Add Folder',      onClick: onAddFolder    },
          { icon: '📎', label: 'Add Query',        onClick: onLoadQueries  },
          { icon: '📥', label: 'Import Files',     onClick: onImportFiles  },
          { icon: '📂', label: 'Import Folder',    onClick: onImportFolder },
          { icon: '📤', label: 'Export',           onClick: onExport       },
          { icon: '', label: '', divider: true, onClick: () => {} },
          { icon: '✎', label: 'Edit',             onClick: onRename       },
          { icon: '✕', label: 'Delete',           danger: true, onClick: onDelete },
        ]} />
      )}

      {isOpen && project.children.length > 0 && (
        <div style={{ paddingLeft: 16, borderLeft: `2px solid ${theme.borderColor}`, marginLeft: 14 }}>
          {project.children.map(node => (
            <NodeView key={node.id} node={node} saved={saved} onOpen={onOpen} depth={1}
              onAddSubFolder={onAddSubFolder} onLoadQueriesInFolder={onLoadQueriesInFolder}
              onRemove={onRemoveNode} onRenameFolder={onRenameFolder}
              onImportFilesInFolder={onImportFilesInFolder}
              onImportFolderInFolder={onImportFolderInFolder}
              onDropFiles={onDropFiles} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── NodeView (recursive) ──────────────────────────────────────────────────────
function NodeView({ node, saved, onOpen, depth, onAddSubFolder, onLoadQueriesInFolder,
  onRemove, onRenameFolder, onImportFilesInFolder, onImportFolderInFolder, onDropFiles }: {
  node: ProjectNode; saved: SavedQuery[]
  onOpen: (sql: string, name: string) => void; depth: number
  onAddSubFolder: (id: string) => void
  onLoadQueriesInFolder: (id: string) => void
  onRemove: (id: string) => void
  onRenameFolder: (id: string, cur: string) => void
  onImportFilesInFolder: (id: string) => void
  onImportFolderInFolder: (id: string) => void
  onDropFiles: (e: React.DragEvent, parentId: string | null) => void
}) {
  if (node.kind === 'query')
    return <QueryRefView ref_={node} saved={saved} onOpen={onOpen}
             onRemove={() => onRemove(node.id)} depth={depth} />
  return <FolderView folder={node} saved={saved} onOpen={onOpen} depth={depth}
           onAddSubFolder={onAddSubFolder} onLoadQueriesInFolder={onLoadQueriesInFolder}
           onRemove={onRemove} onRenameFolder={onRenameFolder}
           onImportFilesInFolder={onImportFilesInFolder}
           onImportFolderInFolder={onImportFolderInFolder}
           onDropFiles={onDropFiles} />
}

// ── FolderIcon (blue SVG) ─────────────────────────────────────────────────────
function FolderIcon({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"
      style={{ flexShrink: 0, marginRight: 1 }}
      xmlns="http://www.w3.org/2000/svg">
      {open ? (
        // Open folder
        <path d="M1 3.5A1.5 1.5 0 012.5 2h3.172a1.5 1.5 0 011.06.44l.83.83A1.5 1.5 0 008.62 3.75H13.5A1.5 1.5 0 0115 5.25v.172a2 2 0 00-.5-.172H2a2 2 0 00-2 2V12a1.5 1.5 0 001.5 1.5h11A1.5 1.5 0 0014 12V7.25a.5.5 0 00-.5-.5H2a.5.5 0 01-.5-.5V3.5z
          M1.5 7.75h13l-1.5 5H3L1.5 7.75z"
          fill="#4a9eff" />
      ) : (
        // Closed folder
        <>
          <path d="M2.5 2A1.5 1.5 0 001 3.5v9A1.5 1.5 0 002.5 14h11A1.5 1.5 0 0015 12.5v-7A1.5 1.5 0 0013.5 4H8.621a1.5 1.5 0 01-1.06-.44l-.83-.83A1.5 1.5 0 005.672 2H2.5z"
            fill="#4a9eff" />
        </>
      )}
    </svg>
  )
}

// ── FolderView ────────────────────────────────────────────────────────────────
function FolderView({ folder, saved, onOpen, depth, onAddSubFolder, onLoadQueriesInFolder,
  onRemove, onRenameFolder, onImportFilesInFolder, onImportFolderInFolder, onDropFiles }: {
  folder: FolderNode; saved: SavedQuery[]
  onOpen: (sql: string, name: string) => void; depth: number
  onAddSubFolder: (id: string) => void
  onLoadQueriesInFolder: (id: string) => void
  onRemove: (id: string) => void
  onRenameFolder: (id: string, cur: string) => void
  onImportFilesInFolder: (id: string) => void
  onImportFolderInFolder: (id: string) => void
  onDropFiles: (e: React.DragEvent, parentId: string | null) => void
}) {
  const [isOpen, setIsOpen]     = useState(true)
  const [hovered, setHovered]   = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const menuBtnRef = useRef<HTMLButtonElement>(null)
  const count = countRefs(folder.children)

  return (
    <div>
      <div
        style={{
          ...pS.folderRow, paddingLeft: 6,
          background: dragOver
            ? `${theme.accentColor}28`
            : hovered ? `${theme.accentColor}18` : 'transparent',
          outline: dragOver ? `2px dashed ${theme.accentColor}` : undefined,
          outlineOffset: dragOver ? -2 : undefined,
        }}
        onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
        onClick={() => setIsOpen(v => !v)}
        onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { setDragOver(false); onDropFiles(e, folder.id) }}
      >
        <FolderIcon open={isOpen || dragOver} />
        <span style={pS.folderName}>{folder.name}</span>
        <span style={pS.badge}>{count}</span>
        {(hovered || menuOpen) && (
          <button ref={menuBtnRef} style={pS.menuBtn}
            onClick={e => { e.stopPropagation(); setMenuOpen(v => !v) }}>＋</button>
        )}
      </div>

      {menuOpen && (
        <DropdownMenu anchorRef={menuBtnRef} onClose={() => setMenuOpen(false)} items={[
          { icon: '📁', label: 'Add Sub-folder',   onClick: () => onAddSubFolder(folder.id)              },
          { icon: '📎', label: 'Add Query',         onClick: () => onLoadQueriesInFolder(folder.id)       },
          { icon: '📥', label: 'Import Files',      onClick: () => onImportFilesInFolder(folder.id)       },
          { icon: '📂', label: 'Import Folder',     onClick: () => onImportFolderInFolder(folder.id)      },
          { icon: '', label: '', divider: true, onClick: () => {} },
          { icon: '✎', label: 'Edit',              onClick: () => onRenameFolder(folder.id, folder.name) },
          { icon: '✕', label: 'Remove',            danger: true, onClick: () => onRemove(folder.id)      },
        ]} />
      )}

      {isOpen && folder.children.length > 0 && (
        <div style={{ paddingLeft: 14, borderLeft: `2px solid ${theme.borderColor}`, marginLeft: 12 }}>
          {folder.children.map(child => (
            <NodeView key={child.id} node={child} saved={saved} onOpen={onOpen} depth={depth + 1}
              onAddSubFolder={onAddSubFolder} onLoadQueriesInFolder={onLoadQueriesInFolder}
              onRemove={onRemove} onRenameFolder={onRenameFolder}
              onImportFilesInFolder={onImportFilesInFolder}
              onImportFolderInFolder={onImportFolderInFolder}
              onDropFiles={onDropFiles} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── QueryRefView ──────────────────────────────────────────────────────────────
function QueryRefView({ ref_, saved, onOpen, onRemove, depth }: {
  ref_: QueryRef; saved: SavedQuery[]
  onOpen: (sql: string, name: string) => void
  onRemove: () => void; depth: number
}) {
  const [hovered, setHovered] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuBtnRef = useRef<HTMLButtonElement>(null)
  const q = saved.find(s => s.id === ref_.queryId)
  if (!q) return null

  return (
    <div
      style={{ ...pS.queryRefRow, paddingLeft: 8,
        background: hovered ? theme.bgSecondary : 'transparent' }}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onClick={() => onOpen(q.sql_text, q.name)}
    >
      <span style={pS.queryArrow}>→</span>
      <span style={pS.queryRefName}>{q.name}</span>
      {(hovered || menuOpen) && (
        <button ref={menuBtnRef} style={pS.menuBtn}
          onClick={e => { e.stopPropagation(); setMenuOpen(v => !v) }}>＋</button>
      )}
      {menuOpen && (
        <DropdownMenu anchorRef={menuBtnRef} onClose={() => setMenuOpen(false)} items={[
          { icon: '→', label: 'Open',   onClick: () => onOpen(q.sql_text, q.name) },
          { icon: '✕', label: 'Remove', danger: true, onClick: onRemove },
        ]} />
      )}
    </div>
  )
}

// ── NameModal ─────────────────────────────────────────────────────────────────
function NameModal({ title, defaultValue, onConfirm, onClose }: {
  title: string; defaultValue: string
  onConfirm: (name: string) => void; onClose: () => void
}) {
  const [value, setValue] = useState(defaultValue)
  const submit = () => { if (value.trim()) onConfirm(value.trim()) }
  return (
    <Overlay onClose={onClose}>
      <div style={mS.card}>
        <div style={mS.title}>{title}</div>
        <input autoFocus style={mS.input} value={value} placeholder="Name…"
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onClose() }}
        />
        <div style={mS.btns}>
          <button style={mS.cancel} onClick={onClose}>Cancel</button>
          <button style={{ ...mS.confirm, opacity: value.trim() ? 1 : 0.5 }}
            disabled={!value.trim()} onClick={submit}>Confirm</button>
        </div>
      </div>
    </Overlay>
  )
}

// ── QueryPickerModal — animated Query Library panel ───────────────────────────
// Inject keyframe once at module load
;(function injectAnim() {
  if (typeof document === 'undefined' || document.getElementById('dbai-qp-anim')) return
  const s = document.createElement('style')
  s.id = 'dbai-qp-anim'
  s.textContent = `
    @keyframes qpSlideIn {
      from { opacity: 0; transform: translate(-60px, 20px) scale(0.94); }
      to   { opacity: 1; transform: translate(0, 0)        scale(1);    }
    }
  `
  document.head.appendChild(s)
})()

function QueryPickerModal({ saved, onConfirm, onClose }: {
  saved: SavedQuery[]
  onConfirm: (queryIds: string[]) => void
  onClose: () => void
}) {
  const [selected, setSelected]   = useState<Set<string>>(new Set())
  const [search, setSearch]       = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const groups = useMemo<QGroup[]>(() => {
    const q = search.toLowerCase().trim()
    const filtered = q
      ? saved.filter(s => s.name.toLowerCase().includes(q) ||
          (s.description ?? '').toLowerCase().includes(q) ||
          s.sql_text.toLowerCase().includes(q))
      : saved
    // Mirror QueryLibrary's buildTableTree: each query appears under EVERY table it references
    const map = new Map<string, SavedQuery[]>()
    for (const s of filtered) {
      const tables = extractTables(s.sql_text)
      const buckets = tables.length > 0 ? tables : ['\x00other']
      for (const bucket of buckets) {
        const arr = map.get(bucket) ?? []; arr.push(s); map.set(bucket, arr)
      }
    }
    const keys = [...map.keys()].filter(k => k !== '\x00other').sort()
    if (map.has('\x00other')) keys.push('\x00other')
    return keys.map(k => ({ key: k, queries: map.get(k)! }))
  }, [saved, search])

  const toggleQuery = (id: string) =>
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const toggleGroup = (qs: SavedQuery[]) => {
    const ids = qs.map(q => q.id)
    const allOn = ids.every(id => selected.has(id))
    setSelected(prev => {
      const n = new Set(prev)
      allOn ? ids.forEach(id => n.delete(id)) : ids.forEach(id => n.add(id))
      return n
    })
  }

  const toggleCollapse = (key: string) =>
    setCollapsed(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })

  return (
    <div style={qpS.backdrop} onClick={onClose}>
      <div style={qpS.panel} onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div style={qpS.header}>
          <div style={qpS.headerTop}>
            <span style={qpS.headerIcon}>📄</span>
            <span style={qpS.headerTitle}>Query Library</span>
            <span style={qpS.headerSub}>Select queries to add to project</span>
            <button style={qpS.closeBtn} onClick={onClose}>✕</button>
          </div>
          <input
            autoFocus
            style={qpS.search}
            placeholder="Search queries, tables…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* ── Body ── */}
        <div style={qpS.body}>
          {groups.length === 0 && (
            <div style={qpS.empty}>
              {search ? 'No matching queries.' : 'No saved queries yet.'}
            </div>
          )}
          {groups.map(g => {
            const allOn     = g.queries.every(q => selected.has(q.id))
            const someOn    = g.queries.some(q => selected.has(q.id))
            const isOpen    = !collapsed.has(g.key)
            const label     = g.key === '\x00other' ? '(other)' : g.key
            return (
              <div key={g.key}>
                {/* Group header row */}
                <div style={qpS.groupRow}>
                  <input
                    type="checkbox" checked={allOn}
                    ref={el => { if (el) el.indeterminate = someOn && !allOn }}
                    onChange={() => toggleGroup(g.queries)}
                    onClick={e => e.stopPropagation()}
                    style={qpS.checkbox}
                  />
                  <span style={qpS.groupArrow} onClick={() => toggleCollapse(g.key)}>
                    {isOpen ? '▾' : '▸'}
                  </span>
                  <span style={qpS.groupLabel} onClick={() => toggleCollapse(g.key)}>{label}</span>
                  <span style={qpS.groupBadge}>{g.queries.length}</span>
                </div>

                {/* Query rows */}
                {isOpen && g.queries.map(q => {
                  const isSel = selected.has(q.id)
                  return (
                    <div
                      key={q.id}
                      style={{ ...qpS.queryRow, background: isSel ? `${theme.accentColor}18` : theme.bgSecondary }}
                      onClick={() => toggleQuery(q.id)}
                    >
                      <input
                        type="checkbox" checked={isSel}
                        onChange={() => toggleQuery(q.id)}
                        onClick={e => e.stopPropagation()}
                        style={qpS.checkbox}
                      />
                      <div style={qpS.queryInfo}>
                        <span style={{ ...qpS.queryName, color: isSel ? theme.accentColor : theme.textPrimary }}>
                          {q.name}
                        </span>
                        {q.description && <span style={qpS.queryDesc}>{q.description}</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* ── Footer ── */}
        <div style={qpS.footer}>
          <span style={qpS.selCount}>
            {selected.size > 0 ? `${selected.size} selected` : 'None selected'}
          </span>
          <button style={qpS.cancelBtn} onClick={onClose}>Cancel</button>
          <button
            style={{ ...qpS.confirmBtn, opacity: selected.size ? 1 : 0.4 }}
            disabled={!selected.size}
            onClick={() => onConfirm([...selected])}
          >
            Add {selected.size > 0 ? `${selected.size} quer${selected.size === 1 ? 'y' : 'ies'}` : 'Queries'}
          </button>
        </div>
      </div>
    </div>
  )
}

const qpS = {
  backdrop: {
    position: 'fixed' as const, inset: 0,
    background: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(3px)',
    zIndex: 8000,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  panel: {
    background: theme.bgPanel,
    border: `1px solid ${theme.borderColor}`,
    borderRadius: 14,
    width: 540, maxWidth: '92vw', maxHeight: '80vh',
    display: 'flex', flexDirection: 'column' as const,
    boxShadow: '0 24px 80px rgba(0,0,0,0.65)',
    overflow: 'hidden',
    animation: 'qpSlideIn 0.22s cubic-bezier(0.34, 1.2, 0.64, 1)',
  },
  header: {
    padding: '18px 20px 14px',
    borderBottom: `1px solid ${theme.borderColor}`,
    flexShrink: 0,
  },
  headerTop: {
    display: 'flex' as const, alignItems: 'center', gap: 8, marginBottom: 12,
  },
  headerIcon:  { fontSize: 16 },
  headerTitle: { fontSize: 14, fontWeight: 700 as const, color: theme.textPrimary, flex: 1 },
  headerSub:   { fontSize: 11, color: theme.textMuted },
  closeBtn:    { background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted, fontSize: 14, padding: '0 2px' },
  search: {
    width: '100%', boxSizing: 'border-box' as const,
    background: theme.bgSecondary, border: `1px solid ${theme.borderColor}`,
    borderRadius: 7, padding: '8px 12px',
    color: theme.textPrimary, fontSize: 12, outline: 'none',
  },
  body:       { flex: 1, overflowY: 'auto' as const },
  empty:      { padding: '40px 0', textAlign: 'center' as const, fontSize: 12, color: theme.textMuted },
  groupRow: {
    display: 'flex' as const, alignItems: 'center', gap: 8,
    padding: '8px 16px',
    background: theme.bgPanel,
    borderBottom: `1px solid ${theme.borderColor}`,
    position: 'sticky' as const, top: 0, zIndex: 1,
  },
  checkbox:   { flexShrink: 0, cursor: 'pointer', accentColor: theme.accentColor },
  groupArrow: { fontSize: 10, color: theme.textMuted, cursor: 'pointer', width: 10, flexShrink: 0 },
  groupLabel: { flex: 1, fontSize: 12, fontWeight: 600 as const, color: theme.textPrimary, cursor: 'pointer', userSelect: 'none' as const },
  groupBadge: { fontSize: 10, color: theme.textMuted, background: theme.bgSecondary, borderRadius: 8, padding: '1px 7px', flexShrink: 0 },
  queryRow: {
    display: 'flex' as const, alignItems: 'flex-start', gap: 10,
    padding: '9px 16px 9px 32px',
    borderBottom: `1px solid ${theme.borderColor}22`,
    cursor: 'pointer',
    transition: 'background 0.1s',
  },
  queryInfo:  { flex: 1, overflow: 'hidden', minWidth: 0 },
  queryName:  { display: 'block', fontSize: 12, fontWeight: 500 as const, overflow: 'hidden', whiteSpace: 'nowrap' as const, textOverflow: 'ellipsis' },
  queryDesc:  { display: 'block', fontSize: 10, color: theme.textMuted, marginTop: 2, overflow: 'hidden', whiteSpace: 'nowrap' as const, textOverflow: 'ellipsis' },
  footer: {
    display: 'flex' as const, alignItems: 'center', gap: 10,
    padding: '14px 20px',
    borderTop: `1px solid ${theme.borderColor}`,
    background: theme.bgPanel, flexShrink: 0,
  },
  selCount:   { flex: 1, fontSize: 11, color: theme.textMuted, fontStyle: 'italic' as const },
  cancelBtn:  { background: 'none', border: `1px solid ${theme.borderColor}`, borderRadius: 7, padding: '7px 18px', color: theme.textMuted, cursor: 'pointer', fontSize: 12 },
  confirmBtn: { background: theme.accentColor, border: 'none', borderRadius: 7, padding: '7px 20px', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 as const },
}

// ── FolderStructureModal ──────────────────────────────────────────────────────
function FolderStructureModal({ groups, onConfirm, onClose }: {
  groups: QGroup[]
  onConfirm: (preserve: boolean) => void
  onClose: () => void
}) {
  const namedGroups = groups.filter(g => g.key !== '\x00other')
  return (
    <Overlay onClose={onClose}>
      <div style={{ ...mS.card, width: 380 }}>
        <div style={mS.title}>Keep Folder Structure?</div>
        <p style={mS.body}>
          The selected queries span multiple tables. Create sub-folders to preserve the grouping?
        </p>
        <div style={mS.folderPreview}>
          {namedGroups.map(g => (
            <div key={g.key} style={mS.folderPreviewRow}>
              📁 <strong>{g.key}</strong>
              <span style={{ marginLeft: 6, color: theme.textMuted }}>
                ({g.queries.length} quer{g.queries.length === 1 ? 'y' : 'ies'})
              </span>
            </div>
          ))}
        </div>
        <div style={mS.btns}>
          <button style={mS.cancel} onClick={onClose}>Cancel</button>
          <button
            style={{ ...mS.confirm, background: theme.bgSecondary, color: theme.textPrimary,
              border: `1px solid ${theme.borderColor}` }}
            onClick={() => onConfirm(false)}
          >Add Flat</button>
          <button style={mS.confirm} onClick={() => onConfirm(true)}>Create Folders</button>
        </div>
      </div>
    </Overlay>
  )
}

// ── Overlay ───────────────────────────────────────────────────────────────────
function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={mS.overlay} onClick={onClose}>
      <div onClick={e => e.stopPropagation()}>{children}</div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const pS = {
  sectionHeader: {
    display: 'flex' as const, alignItems: 'center', gap: 5, padding: '7px 12px',
    cursor: 'pointer', userSelect: 'none' as const, background: theme.bgPanel,
    borderBottom: `1px solid ${theme.borderColor}`,
    position: 'sticky' as const, top: 0, zIndex: 2,
  },
  arrow:       { fontSize: 10, color: theme.accentColor, width: 10, flexShrink: 0 },
  sectionLabel:{ flex: 1, fontSize: 11, fontWeight: 700 as const, color: theme.textPrimary, textTransform: 'uppercase' as const, letterSpacing: 0.8 },
  badge:       { fontSize: 10, color: theme.textMuted, background: theme.bgSecondary, borderRadius: 8, padding: '1px 6px', flexShrink: 0 },
  addBtn:      { background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, color: theme.accentColor, padding: '0 2px', lineHeight: 1, flexShrink: 0 },
  empty:       { padding: '10px 14px', fontSize: 11, color: theme.textMuted },
  projectRow:  { display: 'flex' as const, alignItems: 'center', gap: 5, padding: '6px 10px', cursor: 'pointer', userSelect: 'none' as const, borderBottom: `1px solid ${theme.borderColor}` },
  projectName: { flex: 1, fontSize: 12, fontWeight: 600 as const, color: theme.textPrimary, overflow: 'hidden', whiteSpace: 'nowrap' as const, textOverflow: 'ellipsis' },
  folderRow:   { display: 'flex' as const, alignItems: 'center', gap: 5, padding: '4px 8px', cursor: 'pointer', userSelect: 'none' as const, borderBottom: `1px solid ${theme.borderColor}33` },
  folderIcon:  { fontSize: 11, flexShrink: 0 },
  folderName:  { flex: 1, fontSize: 11, fontWeight: 600 as const, color: theme.textMuted, overflow: 'hidden', whiteSpace: 'nowrap' as const, textOverflow: 'ellipsis' },
  queryRefRow: { display: 'flex' as const, alignItems: 'center', gap: 5, padding: '4px 8px', cursor: 'pointer', borderBottom: `1px solid ${theme.borderColor}1a` },
  queryArrow:  { fontSize: 10, color: theme.accentColor, flexShrink: 0, width: 12 },
  queryRefName:{ flex: 1, fontSize: 11, color: theme.textPrimary, overflow: 'hidden', whiteSpace: 'nowrap' as const, textOverflow: 'ellipsis' },
  iconBtn:     { background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: theme.textMuted, padding: '0 2px', flexShrink: 0 },
  menuBtn:     { background: 'none', border: `1px solid ${theme.borderColor}`, borderRadius: 4, cursor: 'pointer', fontSize: 12, color: theme.accentColor, padding: '1px 5px', flexShrink: 0, lineHeight: 1, fontWeight: 700 as const },
}
const mS = {
  overlay:      { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  card:         { background: theme.bgPanel, border: `1px solid ${theme.borderColor}`, borderRadius: 10, padding: '20px 22px', minWidth: 280, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' },
  title:        { fontSize: 14, fontWeight: 700 as const, color: theme.textPrimary, marginBottom: 12 },
  body:         { fontSize: 12, color: theme.textMuted, lineHeight: 1.5, margin: '0 0 10px 0' },
  input:        { width: '100%', background: theme.bgSecondary, border: `1px solid ${theme.borderColor}`, borderRadius: 5, padding: '7px 10px', color: theme.textPrimary, fontSize: 12, outline: 'none', boxSizing: 'border-box' as const },
  btns:         { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 },
  cancel:       { background: 'none', border: `1px solid ${theme.borderColor}`, borderRadius: 5, padding: '5px 14px', color: theme.textMuted, cursor: 'pointer', fontSize: 12 },
  confirm:      { background: theme.accentColor, border: 'none', borderRadius: 5, padding: '5px 14px', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 as const },
  listScroll:   { maxHeight: 320, overflowY: 'auto' as const, margin: '10px 0', border: `1px solid ${theme.borderColor}`, borderRadius: 6 },
  listEmpty:    { padding: '20px 0', textAlign: 'center' as const, fontSize: 12, color: theme.textMuted },
  groupHeader:  { display: 'flex' as const, alignItems: 'center', gap: 8, padding: '5px 10px', background: theme.bgPanel, cursor: 'pointer', borderBottom: `1px solid ${theme.borderColor}` },
  groupLabel:   { flex: 1, fontSize: 11, fontWeight: 600 as const, color: theme.textPrimary },
  groupCount:   { fontSize: 10, color: theme.textMuted },
  queryRow:     { display: 'flex' as const, alignItems: 'center', gap: 8, padding: '4px 10px 4px 26px', cursor: 'pointer', borderBottom: `1px solid ${theme.borderColor}22`, background: theme.bgSecondary },
  queryName:    { fontSize: 11, color: theme.textPrimary, overflow: 'hidden', whiteSpace: 'nowrap' as const, textOverflow: 'ellipsis' },
  folderPreview:{ margin: '0 0 4px 0', padding: '8px 12px', background: theme.bgSecondary, borderRadius: 6, fontSize: 12 },
  folderPreviewRow: { marginBottom: 4, color: theme.textPrimary },
}
