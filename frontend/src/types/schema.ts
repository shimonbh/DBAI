export interface ColumnInfo {
  name: string
  data_type: string
  nullable: boolean
  default: string | null
  is_pk: boolean
}

export interface IndexInfo {
  name: string
  columns: string
  is_unique: boolean
  is_primary: boolean
}

export interface TableSchema {
  name: string
  columns: ColumnInfo[]
  indexes: IndexInfo[]
}

export interface ViewSchema {
  name: string
  columns: ColumnInfo[]
}

export interface ProcedureSchema {
  name: string
  definition: string | null
}

export interface SchemaDatabase {
  name: string
  tables: TableSchema[]
  views: ViewSchema[]
  procedures: ProcedureSchema[]
}

export interface SchemaTree {
  databases: SchemaDatabase[]
}
