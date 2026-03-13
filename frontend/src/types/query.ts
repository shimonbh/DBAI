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
}
