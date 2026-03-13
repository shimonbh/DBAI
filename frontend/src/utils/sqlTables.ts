/**
 * Extract table names referenced in a SQL statement.
 * Handles FROM, JOIN, UPDATE, INSERT INTO.
 * Supports quoted identifiers with spaces: "My Table", [My Table], `My Table`
 * Supports schema-qualified names: schema.table, [schema].[table], dbo."My Table"
 * Returns a sorted, deduplicated lowercase list.
 */
const SKIP = new Set([
  'SELECT', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'IS', 'NULL', 'AS', 'WITH',
  'UNION', 'ALL', 'DISTINCT', 'ORDER', 'GROUP', 'BY', 'HAVING', 'LIMIT',
  'OFFSET', 'VALUES', 'SET', 'CREATE', 'DROP', 'ALTER', 'TABLE', 'INDEX',
  'VIEW', 'RETURNING', 'USING', 'NATURAL', 'CASE', 'WHEN', 'THEN', 'ELSE',
  'END', 'EXISTS', 'BETWEEN', 'LIKE', 'ILIKE', 'OVER', 'PARTITION', 'LATERAL',
  'BEGIN', 'COMMIT', 'ROLLBACK', 'TRUNCATE', 'EXEC', 'EXECUTE', 'CALL',
  'INNER', 'LEFT', 'RIGHT', 'OUTER', 'CROSS', 'FULL', 'ON',
])

export function extractTables(sql: string): string[] {
  const tables = new Set<string>()

  // Optional schema prefix: word, [bracketed], "quoted", or `backtick` followed by a dot
  // Then the actual table identifier in any quoting style, or a plain word.
  // Capture groups: 1 = "double-quoted"  2 = `backtick`  3 = [bracket]  4 = plain
  const re =
    /\b(?:FROM|JOIN|UPDATE|INTO)\s+(?:(?:\w+|\[[^\]]+\]|"[^"]+"|`[^`]+`)\s*\.\s*)?(?:"([^"]+)"|`([^`]+)`|\[([^\]]+)\]|(\w+))/gi

  let m
  while ((m = re.exec(sql)) !== null) {
    const raw = (m[1] ?? m[2] ?? m[3] ?? m[4] ?? '').toLowerCase().trim()
    // Apply SKIP only to plain (unquoted) identifiers — a quoted name is always intentional
    if (raw && (m[4] == null || !SKIP.has(raw.toUpperCase()))) {
      tables.add(raw)
    }
  }

  return [...tables].sort()
}
