import axios from 'axios'
import { getToken, clearToken } from './auth'
import type {
  User,
  Report,
  ReportDetail,
  MetricResult,
  MetricUpdate,
  PanelSummary,
  MetricSummaryItem,
  MetricHistoryPoint,
} from './types'

const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor: attach Bearer token
apiClient.interceptors.request.use(
  (config) => {
    const token = getToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor: handle 401
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearToken()
      if (typeof window !== 'undefined') {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

// ─── Auth API ────────────────────────────────────────────────────────────────

export const authApi = {
  async register(email: string, password: string): Promise<{ access_token: string }> {
    const res = await apiClient.post('/auth/register', { email, password })
    return res.data
  },

  async login(email: string, password: string): Promise<{ access_token: string }> {
    const res = await apiClient.post('/auth/login', { email, password })
    return res.data
  },

  async me(): Promise<User> {
    const res = await apiClient.get('/auth/me')
    return res.data
  },
}

// ─── Reports API ─────────────────────────────────────────────────────────────

export const reportsApi = {
  async upload(file: File): Promise<{ report_id: number; status: string }> {
    const formData = new FormData()
    formData.append('file', file)
    const res = await apiClient.post('/reports/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return res.data
  },

  async list(): Promise<Report[]> {
    const res = await apiClient.get('/reports')
    return res.data
  },

  async get(id: number): Promise<ReportDetail> {
    const res = await apiClient.get(`/reports/${id}`)
    return res.data
  },

  async delete(id: number): Promise<void> {
    await apiClient.delete(`/reports/${id}`)
  },

  async getStatus(id: number): Promise<{ id: number; status: string; error_message?: string }> {
    const res = await apiClient.get(`/reports/${id}/status`)
    return res.data
  },

  async updateMetrics(id: number, updates: MetricUpdate[]): Promise<void> {
    await apiClient.patch(`/reports/${id}/metrics`, { updates })
  },
}

// ─── Metrics API ─────────────────────────────────────────────────────────────

export const metricsApi = {
  async getPanels(): Promise<PanelSummary[]> {
    const res = await apiClient.get('/metrics/panels')
    return res.data
  },

  async getSummary(): Promise<MetricSummaryItem[]> {
    const res = await apiClient.get('/metrics/summary')
    return res.data
  },

  async getHistory(canonicalName: string): Promise<MetricHistoryPoint[]> {
    const res = await apiClient.get(`/metrics/${encodeURIComponent(canonicalName)}/history`)
    return res.data
  },

  async getAll(params?: { panel_name?: string; needs_review?: boolean }): Promise<MetricResult[]> {
    const res = await apiClient.get('/metrics', { params })
    return res.data
  },
}

export default apiClient
