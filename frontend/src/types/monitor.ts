export interface SlowQueryEntry {
  sql: string
  duration_ms: number
  timestamp: string
  user?: string
}

export interface MetricsSnapshot {
  timestamp: string
  connection_id: string
  cpu_percent: number
  active_connections: number
  queries_per_sec: number
  slow_queries: SlowQueryEntry[]
}
