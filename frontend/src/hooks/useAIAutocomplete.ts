import { useCallback } from 'react'
import { useDebouncedCallback } from 'use-debounce'
import { aiService } from '@/services/aiService'
import { useEditorStore } from '@/store/editorStore'
import { theme } from '@/theme'

/**
 * Provides debounced AI inline suggestions.
 * Calls the API only after the user pauses typing for DEBOUNCE_MS.
 */
export function useAIAutocomplete(connectionId: string | null) {
  const setInlineSuggestion = useEditorStore(s => s.setInlineSuggestion)

  const fetchSuggestion = useCallback(async (sql: string, database?: string) => {
    if (!connectionId || sql.trim().length < 3) {
      setInlineSuggestion(null)
      return
    }
    try {
      const suggestion = await aiService.autocomplete(connectionId, sql, { database })
      setInlineSuggestion(suggestion || null)
    } catch {
      setInlineSuggestion(null)
    }
  }, [connectionId, setInlineSuggestion])

  const requestSuggestion = useDebouncedCallback(fetchSuggestion, theme.autocompleteDebouncMs)

  const clearSuggestion = useCallback(() => setInlineSuggestion(null), [setInlineSuggestion])

  return { requestSuggestion, clearSuggestion }
}
