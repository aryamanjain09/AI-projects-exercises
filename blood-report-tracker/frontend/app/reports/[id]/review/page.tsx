'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Save, CheckCircle, Loader2, AlertCircle } from 'lucide-react'
import { Navbar } from '@/components/layout/Navbar'
import { reportsApi, authApi } from '@/lib/api'
import { toast } from '@/components/ui/Toaster'
import type { MetricResult, MetricUpdate, User } from '@/lib/types'

interface EditableMetric extends MetricResult {
  editValue: string
  editUnit: string
  editRefLow: string
  editRefHigh: string
  confirmed: boolean
}

export default function ReviewPage() {
  const params = useParams()
  const router = useRouter()
  const id = Number(params.id)

  const [user, setUser] = useState<User | null>(null)
  const [metrics, setMetrics] = useState<EditableMetric[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const [userData, report] = await Promise.all([authApi.me(), reportsApi.get(id)])
        setUser(userData)
        const reviewMetrics = report.metric_results
          .filter((m) => m.needs_review)
          .map((m) => ({
            ...m,
            editValue: m.value != null ? String(m.value) : '',
            editUnit: m.unit || '',
            editRefLow: m.ref_range_low != null ? String(m.ref_range_low) : '',
            editRefHigh: m.ref_range_high != null ? String(m.ref_range_high) : '',
            confirmed: false,
          }))
        setMetrics(reviewMetrics)
      } catch {
        toast('Failed to load review data', 'error')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  function updateField(
    metricId: number,
    field: keyof EditableMetric,
    value: string | boolean
  ) {
    setMetrics((prev) =>
      prev.map((m) => (m.id === metricId ? { ...m, [field]: value } : m))
    )
  }

  function confirmMetric(metricId: number) {
    setMetrics((prev) =>
      prev.map((m) => (m.id === metricId ? { ...m, confirmed: true } : m))
    )
  }

  async function handleSaveAll() {
    setSaving(true)
    try {
      const updates: MetricUpdate[] = metrics.map((m) => ({
        metric_id: m.id,
        value: m.editValue !== '' ? parseFloat(m.editValue) : null,
        unit: m.editUnit || null,
        ref_range_low: m.editRefLow !== '' ? parseFloat(m.editRefLow) : null,
        ref_range_high: m.editRefHigh !== '' ? parseFloat(m.editRefHigh) : null,
      }))
      await reportsApi.updateMetrics(id, updates)
      toast('Review saved successfully', 'success')
      router.push('/dashboard')
    } catch {
      toast('Failed to save changes', 'error')
    } finally {
      setSaving(false)
    }
  }

  const confirmedCount = metrics.filter((m) => m.confirmed).length

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar userEmail={user?.email} />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <Link
            href={`/reports/${id}`}
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Report
          </Link>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Manual Review</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {metrics.length} metric{metrics.length !== 1 ? 's' : ''} need your review
            </p>
          </div>
          {metrics.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">
                {confirmedCount}/{metrics.length} confirmed
              </span>
              <button
                onClick={handleSaveAll}
                disabled={saving}
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg px-4 py-2.5 transition-colors"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {saving ? 'Saving…' : 'Save All & Finish'}
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : metrics.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-2xl border border-gray-200">
            <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
            <h2 className="text-lg font-semibold text-gray-900">No metrics need review</h2>
            <p className="text-sm text-gray-500 mt-1">All metrics were extracted with high confidence.</p>
            <Link
              href="/dashboard"
              className="mt-5 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg px-4 py-2.5 transition-colors"
            >
              Go to Dashboard
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {metrics.map((metric) => (
              <div
                key={metric.id}
                className={`bg-white rounded-2xl border shadow-sm p-6 transition-all ${
                  metric.confirmed
                    ? 'border-green-200 bg-green-50'
                    : 'border-yellow-200 bg-yellow-50'
                }`}
              >
                <div className="flex items-start justify-between gap-4 mb-5">
                  <div>
                    <div className="flex items-center gap-2">
                      {metric.confirmed ? (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-yellow-500" />
                      )}
                      <h3 className="font-semibold text-gray-900 text-base">
                        {metric.canonical_name || metric.raw_name}
                      </h3>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 ml-7">Raw: &ldquo;{metric.raw_name}&rdquo;</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {metric.confidence_score != null && (
                      <div className="text-xs text-gray-500">
                        Confidence:{' '}
                        <span
                          className={`font-semibold ${
                            metric.confidence_score >= 0.8
                              ? 'text-green-600'
                              : metric.confidence_score >= 0.5
                              ? 'text-yellow-600'
                              : 'text-red-600'
                          }`}
                        >
                          {Math.round(metric.confidence_score * 100)}%
                        </span>
                      </div>
                    )}
                    {metric.ref_range_text && (
                      <div className="text-xs text-gray-400 mt-0.5">
                        Extracted range: {metric.ref_range_text}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Value</label>
                    <input
                      type="number"
                      step="any"
                      value={metric.editValue}
                      onChange={(e) => updateField(metric.id, 'editValue', e.target.value)}
                      disabled={metric.confirmed}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                      placeholder="e.g. 5.2"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Unit</label>
                    <input
                      type="text"
                      value={metric.editUnit}
                      onChange={(e) => updateField(metric.id, 'editUnit', e.target.value)}
                      disabled={metric.confirmed}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                      placeholder="e.g. mmol/L"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Ref Range Low
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={metric.editRefLow}
                      onChange={(e) => updateField(metric.id, 'editRefLow', e.target.value)}
                      disabled={metric.confirmed}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                      placeholder="e.g. 3.5"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Ref Range High
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={metric.editRefHigh}
                      onChange={(e) => updateField(metric.id, 'editRefHigh', e.target.value)}
                      disabled={metric.confirmed}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                      placeholder="e.g. 5.0"
                    />
                  </div>
                </div>

                {!metric.confirmed && (
                  <div className="mt-4 flex justify-end">
                    <button
                      onClick={() => confirmMetric(metric.id)}
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-green-700 bg-green-100 hover:bg-green-200 border border-green-200 px-4 py-2 rounded-lg transition-colors"
                    >
                      <CheckCircle className="h-4 w-4" />
                      Confirm
                    </button>
                  </div>
                )}

                {metric.confirmed && (
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-sm text-green-700 font-medium flex items-center gap-1.5">
                      <CheckCircle className="h-4 w-4" />
                      Confirmed
                    </span>
                    <button
                      onClick={() => updateField(metric.id, 'confirmed', false)}
                      className="text-xs text-gray-500 hover:text-gray-700 underline"
                    >
                      Edit
                    </button>
                  </div>
                )}
              </div>
            ))}

            <div className="flex justify-end pt-2">
              <button
                onClick={handleSaveAll}
                disabled={saving}
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium rounded-lg px-6 py-3 transition-colors"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {saving ? 'Saving…' : 'Save All & Finish'}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
