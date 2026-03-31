export type DBType = 'mssql' | 'mysql' | 'postgresql' | 'sqlite'

export interface ConnectionProfile {
  id: string
  name: string
  db_type: DBType
  host: string
  port?: number
  database: string
  username: string
  password?: string
  windows_auth?: boolean
  is_connected: boolean
  created_at: string
  updated_at: string
}

export interface ConnectionFormData {
  name: string
  db_type: DBType
  host: string
  port?: number
  database: string
  username: string
  password: string
  windows_auth?: boolean
}
