import api from './api'
import type { AnalysisResult, AIProvider } from '@/types/ai'

interface AIOverride { provider?: string; model?: string; database?: string }

/** A single turn in an Ask AI conversation (sent to the backend as multi-turn context). */
export interface ConversationMessage { role: 'user' | 'assistant'; content: string }

export const aiService = {
  autocomplete: (connectionId: string, partialSql: string, opts: AIOverride = {}) =>
    api.post<{ suggestion: string }>(`/ai/${connectionId}/autocomplete`, {
      partial_sql: partialSql, ...opts,
    }).then(r => r.data.suggestion),

  completeQuery: (connectionId: string, context: string, opts: AIOverride = {}) =>
    api.post<{ sql: string }>(`/ai/${connectionId}/complete`, { context, ...opts }).then(r => r.data.sql),

  textToSQL: (
    connectionId: string,
    description: string,
    opts: AIOverride & { history?: ConversationMessage[] } = {},
  ) =>
    api.post<{ sql: string }>(`/ai/${connectionId}/text-to-sql`, { description, ...opts }).then(r => r.data.sql),

  analyze: (connectionId: string, sql: string, opts: AIOverride = {}) =>
    api.post<AnalysisResult>(`/ai/${connectionId}/analyze`, { sql, ...opts }).then(r => r.data),

  nameQuery: (connectionId: string, sql: string, opts: AIOverride = {}) =>
    api.post<{ name: string; description: string }>(`/ai/${connectionId}/name-query`, { sql, ...opts }).then(r => r.data),

  getProviders: () => api.get<AIProvider[]>('/ai/providers').then(r => r.data),

  updateProvider: (name: string, data: Partial<AIProvider> & { api_key?: string }) =>
    api.put(`/ai/providers/${name}`, data).then(r => r.data),
}
