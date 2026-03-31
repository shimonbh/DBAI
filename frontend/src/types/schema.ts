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

export interface TriggerInfo {
  name: string
  timing: string   // BEFORE | AFTER | INSTEAD OF
  event: string    // INSERT | UPDATE | DELETE | INSERT, UPDATE, ...
  body?: string    // Full trigger body / function definition returned by the DB
}

export interface ConstraintInfo {
  name: string
  definition: string
}

export interface ForeignKeyInfo {
  name: string
  columns: string
  ref_table: string
  ref_columns: string
}

export interface TableSchema {
  name: string
  columns: ColumnInfo[]
  indexes: IndexInfo[]
  triggers: TriggerInfo[]
  constraints: ConstraintInfo[]
  foreign_keys: ForeignKeyInfo[]
}

export interface ViewSchema {
  name: string
  columns: ColumnInfo[]
}

export interface ProcedureParam {
  name: string
  data_type: string
}

export interface ProcedureSchema {
  name: string
  definition: string | null
  parameters?: ProcedureParam[]
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
