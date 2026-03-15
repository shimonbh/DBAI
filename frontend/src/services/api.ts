/**
 * Axios base instance. All service modules import this.
 * The proxy in vite.config.ts forwards /api and /ws to the Python backend.
 */
import axios from 'axios'

// In Electron production the page is loaded from file:// — no dev proxy exists,
// so we talk directly to the backend on localhost.
const BASE_URL =
  typeof window !== 'undefined' && window.location.protocol === 'file:'
    ? 'http://127.0.0.1:8000/api'
    : '/api'

const api = axios.create({
  baseURL: BASE_URL,
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
