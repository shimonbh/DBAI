import type { ColumnInfo, TriggerInfo } from '@/types/schema'

export function quoteIdentifier(name: string, dbType: string): string {
  const hasSpecial = /[^a-zA-Z0-9_]/.test(name)
  // PostgreSQL folds unquoted identifiers to lowercase — any uppercase must be quoted
  const needsPgQuote = dbType === 'postgresql' && /[A-Z]/.test(name)
  if (!hasSpecial && !needsPgQuote) return name
  if (dbType === 'mysql') return `\`${name}\``
  if (dbType === 'mssql') return `[${name}]`
  return `"${name}"`  // postgresql, sqlite
}

function placeholder(col: ColumnInfo): string {
  const t = col.data_type.toLowerCase()
  if (/int|serial|number|numeric|bigint|smallint|tinyint|rowid/.test(t)) return '1'
  if (/float|double|decimal|real|money/.test(t))                          return '0.0'
  if (/bool|bit/.test(t))                                                  return 'true'
  if (/date(?!time)/.test(t))                                              return "'2024-01-01'"
  if (/datetime|timestamp/.test(t))                                        return "'2024-01-01 00:00:00'"
  return "'value'"
}

export function buildSelect(
  table: string,
  columns: ColumnInfo[],
  dbType: string,
): string {
  const q  = (n: string) => quoteIdentifier(n, dbType)
  const qt = q(table)
  if (!columns.length) return `SELECT *\nFROM ${qt}\nLIMIT 100`
  const cols = columns.map(c => q(c.name)).join(', ')
  const limit = dbType === 'mssql'
    ? `SELECT TOP 100 ${cols}\nFROM ${qt}`
    : `SELECT ${cols}\nFROM ${qt}\nLIMIT 100`
  return limit
}

export function buildInsert(
  table: string,
  columns: ColumnInfo[],
  dbType: string,
): string {
  const q  = (n: string) => quoteIdentifier(n, dbType)
  const qt = q(table)
  if (!columns.length) return `INSERT INTO ${qt} () VALUES ()`
  const cols   = columns.map(c => q(c.name)).join(', ')
  const values = columns.map(c => placeholder(c)).join(', ')
  return `INSERT INTO ${qt}\n  (${cols})\nVALUES\n  (${values})`
}

export function buildUpdate(
  table: string,
  columns: ColumnInfo[],
  dbType: string,
): string {
  const q  = (n: string) => quoteIdentifier(n, dbType)
  const qt = q(table)
  if (!columns.length) return `UPDATE ${qt}\nSET col = value\nWHERE id = 1`

  const pks  = columns.filter(c => c.is_pk)
  const rest = columns.filter(c => !c.is_pk)
  const setCols = (rest.length ? rest : columns)
    .map(c => `    ${q(c.name)} = ${placeholder(c)}`)
    .join(',\n')
  const wherePks = (pks.length ? pks : columns.slice(0, 1))
    .map(c => `${q(c.name)} = ${placeholder(c)}`)
    .join(' AND ')
  return `UPDATE ${qt}\nSET\n${setCols}\nWHERE ${wherePks}`
}

export function buildDropTrigger(
  trigger: string,
  table: string,
  dbType: string,
): string {
  if (dbType === 'postgresql') return `DROP TRIGGER IF EXISTS ${trigger} ON ${table};`
  return `DROP TRIGGER IF EXISTS ${trigger};`
}

export function buildModifyTrigger(
  trigger: TriggerInfo,
  table: string,
  dbType: string,
): string {
  if (dbType === 'mssql') {
    // sys.sql_modules.definition contains the full CREATE TRIGGER statement.
    // Convert to ALTER TRIGGER by replacing the leading CREATE keyword.
    if (trigger.body) {
      return trigger.body.replace(/^\s*CREATE\s+TRIGGER/i, 'ALTER TRIGGER').trimStart()
    }
    return `ALTER TRIGGER ${trigger.name} ON ${table}\n${trigger.timing} ${trigger.event}\nAS\nBEGIN\n  -- TODO\nEND`
  }

  if (dbType === 'postgresql') {
    // body is pg_get_functiondef() — the full function the trigger calls.
    // Editing the function is how you modify a PostgreSQL trigger's logic.
    if (trigger.body) return trigger.body
    return `CREATE OR REPLACE TRIGGER ${trigger.name}\n  ${trigger.timing} ${trigger.event}\n  ON ${table}\n  FOR EACH ROW\n  EXECUTE FUNCTION todo_function();`
  }

  // MySQL — must DROP and re-CREATE; body is information_schema ACTION_STATEMENT.
  // Strip trailing semicolon — it is not needed before the DELIMITER marker.
  const rawBody   = trigger.body?.trim() ?? ''
  const body      = rawBody.endsWith(';') ? rawBody.slice(0, -1) : rawBody
  const bodyBlock = body || 'BEGIN\n  -- TODO\nEND'
  return (
    `DROP TRIGGER IF EXISTS ${trigger.name};\n\n` +
    `DELIMITER $$\n` +
    `CREATE TRIGGER ${trigger.name}\n` +
    `  ${trigger.timing} ${trigger.event}\n` +
    `  ON ${table}\n` +
    `  FOR EACH ROW\n` +
    `${bodyBlock}$$\n` +
    `DELIMITER ;`
  )
}

export function buildDelete(
  table: string,
  columns: ColumnInfo[],
  dbType: string,
): string {
  const q  = (n: string) => quoteIdentifier(n, dbType)
  const qt = q(table)
  const pks = columns.filter(c => c.is_pk)
  const wherePks = (pks.length ? pks : columns.slice(0, 1))
    .map(c => `${q(c.name)} = ${placeholder(c)}`)
    .join(' AND ')
  return `DELETE FROM ${qt}\nWHERE ${wherePks || 'id = 1'}`
}
