'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, TrendingUp, TrendingDown, Minus, ExternalLink } from 'lucide-react'
import { Navbar } from '@/components/layout/Navbar'
import { MetricLineChart } from '@/components/charts/MetricLineChart'
import { metricsApi, authApi } from '@/lib/api'
import { toast } from '@/components/ui/Toaster'
import { unslugify, formatDate, formatValue, slugify } from '@/lib/utils'
import type { MetricHistoryPoint, MetricSummaryItem, User } from '@/lib/types'
import { TrendDirection } from '@/lib/types'
import { cn } from '@/lib/utils'

export default function MetricPage() {
  const params = useParams()
  const metricSlug = params.metric as string
  const metricName = unslugify(metricSlug)

  const [user, setUser] = useState<User | null>(null)
  const [history, setHistory] = useState<MetricHistoryPoint[]>([])
  const [summaryItem, setSummaryItem] = useState<MetricSummaryItem | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [userData, summary] = await Promise.all([authApi.me(), metricsApi.getSummary()])
        setUser(userData)

        // Find matching metric from summary (slug comparison)
        const found = summary.find(
          (s) => slugify(s.canonical_name) === metricSlug
        )
        setSummaryItem(found ?? null)

        // Fetch history using the actual canonical name from summary or fallback
        const canonicalName = found?.canonical_name ?? metricName
        const historyData = await metricsApi.getHistory(canonicalName)
        const sorted = [...historyData].sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        )
        setHistory(sorted)
      } catch {
        toast('Failed to load metric data', 'error')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [metricSlug, metricName])

  // Stats from history
  const values = history.map((h) => h.value)
  const minVal = values.length ? Math.min(...values) : null
  const maxVal = values.length ? Math.max(...values) : null
  const avgVal = values.length
    ? values.reduce((a, b) => a + b, 0) / values.length
    : null

  const refLow =
    history.find((h) => h.ref_range_low != null)?.ref_range_low ?? null
  const refHigh =
    history.find((h) => h.ref_range_high != null)?.ref_range_high ?? null
  const unit = summaryItem?.latest_unit ?? history[0]?.unit ?? null

  const trend = summaryItem?.trend ?? TrendDirection.STABLE

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar userEmail={user?.email} />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-6">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    {summaryItem?.panel_name && (
                      <Link
                        href={`/panels/${slugify(summaryItem.panel_name)}`}
                        className="text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full hover:bg-blue-100 transition-colors"
                      >
                        {summaryItem.panel_name}
                      </Link>
                    )}
                  </div>
                  <h1 className="text-2xl font-bold text-gray-900">{summaryItem?.canonical_name ?? metricName}</h1>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-xs text-gray-500 mb-0.5">Latest value</p>
                    <p
                      className={cn(
                        'text-3xl font-bold',
                        summaryItem?.in_range === false
                          ? 'text-red-600'
                          : summaryItem?.in_range === true
                          ? 'text-green-700'
                          : 'text-gray-900'
                      )}
                    >
                      {formatValue(summaryItem?.latest_value, unit)}
                    </p>
                  </div>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-2">
                    {trend === TrendDirection.UP ? (
                      <TrendingUp className="h-6 w-6 text-blue-500" />
                    ) : trend === TrendDirection.DOWN ? (
                      <TrendingDown className="h-6 w-6 text-blue-500" />
                    ) : (
                      <Minus className="h-6 w-6 text-gray-400" />
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <StatMini label="Min" value={formatValue(minVal, unit)} />
              <StatMini label="Max" value={formatValue(maxVal, unit)} />
              <StatMini label="Average" value={avgVal != null ? formatValue(parseFloat(avgVal.toFixed(2)), unit) : '—'} />
              <StatMini label="Data Points" value={String(history.length)} />
            </div>

            {/* Chart */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-6">
              <h2 className="text-base font-semibold text-gray-900 mb-4">History</h2>
              <MetricLineChart
                data={history}
                metricName={summaryItem?.canonical_name ?? metricName}
                unit={unit}
                refRangeMin={refLow}
                refRangeMax={refHigh}
                height={320}
              />
            </div>

            {/* Data table */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
                <h2 className="font-semibold text-gray-900">All Readings</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Date
                      </th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Value
                      </th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Reference Range
                      </th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Lab
                      </th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Status
                      </th>
                      <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Report
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {[...history].reverse().map((point, i) => (
                      <tr key={i} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3.5 text-gray-700">{formatDate(point.date)}</td>
                        <td className="px-5 py-3.5">
                          <span
                            className={cn(
                              'font-semibold',
                              point.in_range === false
                                ? 'text-red-600'
                                : point.in_range === true
                                ? 'text-green-700'
                                : 'text-gray-900'
                            )}
                          >
                            {formatValue(point.value, point.unit)}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-gray-500 text-xs">
                          {point.ref_range_low != null && point.ref_range_high != null
                            ? `${point.ref_range_low} – ${point.ref_range_high} ${unit ?? ''}`
                            : '—'}
                        </td>
                        <td className="px-5 py-3.5 text-gray-500">{point.lab_name || '—'}</td>
                        <td className="px-5 py-3.5">
                          {point.in_range === true ? (
                            <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full font-medium">
                              In range
                            </span>
                          ) : point.in_range === false ? (
                            <span className="text-xs text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full font-medium">
                              Out of range
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <Link
                            href={`/reports/${point.report_id}`}
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                          >
                            <ExternalLink className="h-3 w-3" />
                            #{point.report_id}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}

function StatMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
      <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">{label}</p>
      <p className="text-lg font-bold text-gray-900 mt-1">{value}</p>
    </div>
  )
}
