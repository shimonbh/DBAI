import { useRef, useCallback, useEffect } from 'react'
import MonacoReact from '@monaco-editor/react'
import type * as Monaco from 'monaco-editor'
import { theme } from '@/theme'
import { useConnectionStore } from '@/store/connectionStore'
import { useSchemaStore } from '@/store/schemaStore'
import { useEditorStore } from '@/store/editorStore'
import { useUIStore } from '@/store/uiStore'
import { useAIAutocomplete } from '@/hooks/useAIAutocomplete'

interface Props {
  tabId: string
  sql: string
  onChange: (sql: string) => void
}

/**
 * Monaco editor wrapper with:
 * - SQL language mode, dark theme from .env
 * - Auto-indent enabled
 * - Tab key → full query generation via AI
 * - Inline ghost text suggestion (debounced AI, displayed via decorations)
 * - Dropdown completion: schema-based only (tables + columns, instant, no AI)
 */
export function MonacoEditor({ tabId, sql, onChange }: Props) {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof Monaco | null>(null)
  const decorRef  = useRef<string[]>([])

  const { activeConnectionId, profiles } = useConnectionStore()
  const { selectedDatabase, databases } = useSchemaStore()
  const { inlineSuggestion, setInlineSuggestion, generateFullQuery } = useEditorStore()
  const { requestSuggestion } = useAIAutocomplete(activeConnectionId)
  const isDark = useUIStore(s => s.isDark)
  const editorTheme = isDark ? 'vs-dark' : 'vs'

  const dbType = profiles.find(p => p.id === activeConnectionId)?.db_type ?? 'sqlite'

  // Refs so provider closures always read the latest values without re-registering
  const connRef      = useRef(activeConnectionId)
  const schemaRef    = useRef(databases)
  const dbTypeRef    = useRef(dbType)
  useEffect(() => { connRef.current   = activeConnectionId }, [activeConnectionId])
  useEffect(() => { schemaRef.current = databases          }, [databases])
  useEffect(() => { dbTypeRef.current = dbType             }, [dbType])

  // Register Monaco completion + Tab key once on mount
  const handleEditorMount = useCallback(
    (editor: Monaco.editor.IStandaloneCodeEditor, monaco: typeof Monaco) => {
      editorRef.current = editor
      monacoRef.current = monaco

      // ── Schema-based completion (tables + columns, instant, no AI) ───────────
      monaco.languages.registerCompletionItemProvider('sql', {
        triggerCharacters: [' ', '.', '('],
        provideCompletionItems: (model: Monaco.editor.ITextModel, position: Monaco.Position) => {
          const dbs = schemaRef.current
          const qt  = _quoteChar(dbTypeRef.current)

          const wordInfo = model.getWordUntilPosition(position)
          const range = new monaco.Range(
            position.lineNumber, wordInfo.startColumn,
            position.lineNumber, wordInfo.endColumn,
          )

          // Only suggest when the cursor is in a contextually relevant SQL position
          const textBefore = model.getValueInRange(
            new monaco.Range(1, 1, position.lineNumber, position.column)
          )
          const ctx = _sqlContext(textBefore)
          if (!ctx) return { suggestions: [] }

          // Parse FROM/JOIN clauses to resolve aliases → actual table names
          const aliasMap = _extractAliasMap(model.getValue())

          // Resolve dot-notation hint (may be alias or table name)
          const resolvedHint = ctx.tableHint
            ? (aliasMap.get(ctx.tableHint.toLowerCase()) ?? ctx.tableHint).toLowerCase()
            : null

          // For column context without a specific hint, limit to tables in the query
          const referencedTables = aliasMap.size > 0
            ? new Set([...aliasMap.values()].map(v => v.toLowerCase()))
            : null

          const quote = (name: string) => {
            if (!_needsQuote(name)) return name
            return dbTypeRef.current === 'mssql' ? `[${name}]` : `${qt}${name}${qt}`
          }

          const suggestions: Monaco.languages.CompletionItem[] = []
          for (const db of dbs) {
            for (const table of db.tables ?? []) {
              const tl = table.name.toLowerCase()

              if (ctx.type === 'table') {
                suggestions.push({
                  label: table.name,
                  kind: monaco.languages.CompletionItemKind.Class,
                  insertText: quote(table.name),
                  detail: `table · ${db.name}`,
                  range,
                })
                continue
              }

              // Column context: filter by resolved alias/table or by query-referenced tables
              if (resolvedHint && tl !== resolvedHint) continue
              if (!resolvedHint && referencedTables && !referencedTables.has(tl)) continue

              for (const col of table.columns ?? []) {
                suggestions.push({
                  label: col.name,
                  kind: monaco.languages.CompletionItemKind.Field,
                  insertText: quote(col.name),
                  detail: `${col.data_type ?? ''}${col.is_pk ? ' · PK' : ''} · ${table.name}`,
                  range,
                })
              }
            }
          }

          return { suggestions }
        },
      })

      // ── Tab key → accept suggestion or generate full query ─────────────────
      editor.addCommand(monaco.KeyCode.Tab, async () => {
        const hasSelection = !editor.getSelection()?.isEmpty()
        if (hasSelection) {
          editor.trigger('keyboard', 'tab', null)
          return
        }
        // If the suggest widget is open, accept the highlighted item
        const suggestCtrl = editor.getContribution<{ dispose(): void; model?: { state: number } }>(
          'editor.contrib.suggestController'
        )
        if (suggestCtrl?.model?.state !== 0) {
          editor.trigger('keyboard', 'acceptSelectedSuggestion', null)
          return
        }
        const cid = connRef.current
        if (cid) await generateFullQuery(cid)
      })

      // ── F5 key → run query (selected text or full SQL) ─────────────────────
      editor.addCommand(monaco.KeyCode.F5, async () => {
        const cid = connRef.current
        if (!cid) return
        const selection = editor.getSelection()
        const model = editor.getModel()
        const selectedText =
          selection && !selection.isEmpty() && model
            ? model.getValueInRange(selection)
            : null
        if (selectedText?.trim()) {
          await useEditorStore.getState().executeQueryText(cid, selectedText)
        } else {
          await useEditorStore.getState().executeQuery(cid)
        }
      })

      // ── Escape key → clear inline suggestion ───────────────────────────────
      editor.addCommand(monaco.KeyCode.Escape, () => {
        setInlineSuggestion(null)
        _clearDecorations(editor, monacoRef.current!, decorRef)
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []   // register once — live values come from refs
  )

  // Show ghost text decoration when inlineSuggestion changes
  const showGhostText = useCallback(() => {
    const editor = editorRef.current
    const monaco = monacoRef.current
    if (!editor || !monaco || !inlineSuggestion) return

    const pos = editor.getPosition()
    if (!pos) return

    const newDecor = editor.deltaDecorations(decorRef.current, [{
      range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column),
      options: {
        after: {
          content: inlineSuggestion,
          inlineClassName: 'ai-ghost-text',
        },
      },
    }])
    decorRef.current = newDecor
  }, [inlineSuggestion])

  // Sync ghost text whenever suggestion changes
  if (inlineSuggestion) showGhostText()
  else if (editorRef.current && monacoRef.current) {
    _clearDecorations(editorRef.current, monacoRef.current, decorRef)
  }

  const handleChange = (value: string | undefined) => {
    const newSql = value ?? ''
    onChange(newSql)
    setInlineSuggestion(null)
    // Trigger debounced AI autocomplete
    requestSuggestion(newSql, selectedDatabase ?? undefined)
  }

  return (
    <>
      <style>{`.ai-ghost-text { color: ${theme.textMuted}; opacity: 0.6; font-style: italic; }`}</style>
      <MonacoReact
        height="100%"
        language="sql"
        theme={editorTheme}
        value={sql}
        onChange={handleChange}
        onMount={handleEditorMount}
        options={{
          fontSize: theme.editorFontSize,
          fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', 'Consolas', monospace",
          fontLigatures: true,
          minimap: { enabled: false },
          lineNumbers: 'on',
          autoIndent: 'full',
          formatOnType: true,
          tabSize: 4,
          wordWrap: 'on',
          scrollBeyondLastLine: false,
          suggest: { showWords: false },
          quickSuggestions: { other: true, comments: false, strings: false },
        }}
      />
    </>
  )
}

/** Returns true if an identifier requires quoting (spaces or reserved-char). */
function _needsQuote(name: string): boolean {
  return /[^a-zA-Z0-9_]/.test(name)
}

/** Returns the wrapping quote character for the database type. */
function _quoteChar(dbType: string): string {
  if (dbType === 'mysql') return '`'
  return '"'   // sqlite, postgresql — mssql handled separately as [name]
}

/**
 * Parse FROM/JOIN clauses to build a map of alias/tablename → actual table name.
 * e.g. "FROM orders o JOIN customers c" → { o: 'orders', orders: 'orders', c: 'customers', ... }
 */
function _extractAliasMap(sql: string): Map<string, string> {
  const map = new Map<string, string>()
  const SKIP = new Set(['ON', 'WHERE', 'SET', 'LEFT', 'RIGHT', 'INNER',
                        'OUTER', 'CROSS', 'FULL', 'JOIN', 'USING', 'AS'])
  const re = /\b(?:FROM|JOIN)\s+(["'`[\]\w]+)(?:\s+(?:AS\s+)?([\w]+))?/gi
  let m
  while ((m = re.exec(sql)) !== null) {
    const rawTable = m[1].replace(/["'`[\]]/g, '')
    const rawAlias = m[2]
    map.set(rawTable.toLowerCase(), rawTable)
    if (rawAlias && !SKIP.has(rawAlias.toUpperCase())) {
      map.set(rawAlias.toLowerCase(), rawTable)
    }
  }
  return map
}

/**
 * Determine SQL completion context from text before the cursor.
 * Returns null when the cursor is not in a position that warrants suggestions.
 */
function _sqlContext(
  textBefore: string,
): { type: 'table' | 'column'; tableHint?: string } | null {
  // Dot notation: tablename.<cursor> → column completions for that table
  const dotMatch = textBefore.match(/(\w+)\.\w*$/)
  if (dotMatch) return { type: 'column', tableHint: dotMatch[1] }

  // Tokenize the text before the current partial word
  const stripped = textBefore.trimEnd().replace(/\w+$/, '')
  const tokens = stripped
    .split(/[\s,()=<>!+\-*/;]+/)
    .filter(Boolean)
    .map(t => t.toUpperCase())

  const TABLE_KW  = new Set(['FROM', 'JOIN', 'INTO', 'UPDATE', 'TABLE',
                              'INNER', 'LEFT', 'RIGHT', 'CROSS', 'FULL', 'OUTER'])
  const COLUMN_KW = new Set(['SELECT', 'WHERE', 'AND', 'OR', 'NOT', 'ON',
                              'HAVING', 'SET', 'BY', 'RETURNING', 'CASE',
                              'WHEN', 'THEN', 'ELSE'])

  // Scan backwards through tokens to find the nearest context keyword
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (TABLE_KW.has(tokens[i]))  return { type: 'table' }
    if (COLUMN_KW.has(tokens[i])) return { type: 'column' }
  }

  return null
}

function _clearDecorations(
  editor: Monaco.editor.IStandaloneCodeEditor,
  _monaco: typeof Monaco,
  decorRef: React.MutableRefObject<string[]>,
) {
  if (decorRef.current.length) {
    decorRef.current = editor.deltaDecorations(decorRef.current, [])
  }
}
