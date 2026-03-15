/**
 * Utilities for the auto-generated SQL query header comment block.
 *
 * The header looks like:
 *   -- ───────────────────────────────────────────────
 *   -- Generated: 2026-03-14 15:22
 *   -- Author   : john          (optional)
 *   -- Purpose  : top customers
 *   -- ───────────────────────────────────────────────
 *   SELECT ...
 *
 * The sentinel is a comment line consisting entirely of '─' (U+2500) dashes.
 */

/** Regex that matches the `-- ────...` sentinel line. */
const HEADER_SENTINEL = /^--\s*[─\u2500]{3,}\s*$/

/**
 * Strip the auto-generated header block from the top of a SQL string.
 * If no header is present the original string is returned unchanged.
 */
export function stripSqlHeader(sql: string): string {
  const lines = sql.split('\n')
  if (!HEADER_SENTINEL.test(lines[0]?.trim() ?? '')) return sql

  // Find the closing sentinel (second occurrence)
  const closeIdx = lines.findIndex((l, i) => i > 0 && HEADER_SENTINEL.test(l.trim()))
  if (closeIdx === -1) return sql

  return lines.slice(closeIdx + 1).join('\n').trimStart()
}

/**
 * Build the header block string (without trailing newline separator).
 * Identical format used by ResultsPane and SavePanel.
 */
export function buildSqlHeader(purpose: string, effectiveUser: string): string {
  const timestamp   = new Date().toISOString().slice(0, 16).replace('T', ' ')
  const line        = '-- ' + '─'.repeat(43)
  const headerLines = [line, `-- Generated: ${timestamp}`]
  if (effectiveUser) headerLines.push(`-- Author   : ${effectiveUser}`)
  headerLines.push(`-- Purpose  : ${purpose}`, line)
  return headerLines.join('\n') + '\n'
}
