import api from './api'
import type { QueryResult, QueryHistoryEntry, SavedQuery } from '@/types/query'

export const queryService = {
  execute: (connectionId: string, sql: string, database?: string, limit = 300, signal?: AbortSignal, trackHistory = true) =>
    api.post<QueryResult>(`/queries/${connectionId}/execute`, { sql, database, limit, track_history: trackHistory }, { signal }).then(r => r.data),

  getHistory: (connectionId: string, limit = 100) =>
    api.get<QueryHistoryEntry[]>(`/queries/${connectionId}/history`, { params: { limit } }).then(r => r.data),

  searchHistory: (connectionId: string, q: string) =>
    api.get<QueryHistoryEntry[]>(`/queries/${connectionId}/history/search`, { params: { q } }).then(r => r.data),

  getSaved: (connectionId?: string) =>
    api.get<SavedQuery[]>('/queries/saved', { params: { connection_id: connectionId } }).then(r => r.data),

  saveQuery: (data: Partial<SavedQuery>) =>
    api.post<SavedQuery>('/queries/saved', data).then(r => r.data),

  updateSaved: (id: string, data: Partial<SavedQuery>) =>
    api.put<SavedQuery>(`/queries/saved/${id}`, data).then(r => r.data),

  deleteHistory: (connectionId: string, id: string) =>
    api.delete(`/queries/${connectionId}/history/${id}`),

  deleteSaved: (id: string) => api.delete(`/queries/saved/${id}`),

  importFile: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post<{ statements: string[]; count: number }>('/queries/import', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data)
  },
}
