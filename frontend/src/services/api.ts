/**
 * Axios base instance. All service modules import this.
 * The proxy in vite.config.ts forwards /api and /ws to the Python backend.
 */
import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 60_000,
})

// Global error handler — logs to console; components handle UI feedback
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const msg = err.response?.data?.detail || err.message
    console.error('[API Error]', msg)
    return Promise.reject(new Error(msg))
  }
)

export default api
