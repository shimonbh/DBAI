import api from './api'
import type { SchemaTree } from '@/types/schema'

export const schemaService = {
  getSchema: (connectionId: string) =>
    api.get<SchemaTree>(`/schema/${connectionId}`).then(r => r.data),

  refreshSchema: (connectionId: string) =>
    api.post<SchemaTree>(`/schema/${connectionId}/refresh`).then(r => r.data),

  getTables: (connectionId: string, database: string) =>
    api.get(`/schema/${connectionId}/${database}/tables`).then(r => r.data),

  getColumns: (connectionId: string, database: string, table: string) =>
    api.get(`/schema/${connectionId}/${database}/${table}/columns`).then(r => r.data),
}
