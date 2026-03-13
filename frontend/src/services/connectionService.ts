import api from './api'
import type { ConnectionProfile, ConnectionFormData } from '@/types/connection'

export const connectionService = {
  getAll: () => api.get<ConnectionProfile[]>('/connections').then(r => r.data),
  getById: (id: string) => api.get<ConnectionProfile>(`/connections/${id}`).then(r => r.data),
  create: (data: ConnectionFormData) => api.post<ConnectionProfile>('/connections', data).then(r => r.data),
  update: (id: string, data: ConnectionFormData) => api.put<ConnectionProfile>(`/connections/${id}`, data).then(r => r.data),
  delete: (id: string) => api.delete(`/connections/${id}`),
  connect: (id: string) => api.post(`/connections/${id}/connect`).then(r => r.data),
  disconnect: (id: string) => api.post(`/connections/${id}/disconnect`).then(r => r.data),
  test: (id: string) => api.post(`/connections/${id}/test`).then(r => r.data),
}
