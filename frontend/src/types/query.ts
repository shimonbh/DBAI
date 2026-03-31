export interface QueryResult {
  query_id: string
  columns: string[]
  rows: unknown[][]
  row_count: number
  duration_ms: number
  error?: string
}

export interface QueryHistoryEntry {
  id: string
  connection_id: string
  sql_text: string
  executed_at: string
  duration_ms: number | null
  row_count: number | null
  had_error: boolean
  error_message: string | null
}

export interface SavedQuery {
  id: string
  connection_id: string | null
  name: string
  description: string | null
  sql_text: string
  tags: string[]
  created_at: string
  updated_at: string
}

/** One open editor tab */
export interface EditorTab {
  id: string
  title: string
  sql: string
  result: QueryResult | null
  isDirty: boolean
  selectedDatabase: string | null
  /** Connection this tab is bound to (set when opened from the explorer).
   *  Query execution uses this first; falls back to the caller-supplied connectionId. */
  connectionId?: string
  /** Set when the tab was opened from the schema/query explorer (not typed by the user).
   *  Cleared the moment the user edits the SQL. Prevents history recording on execute. */
  fromExplorer?: boolean
}
