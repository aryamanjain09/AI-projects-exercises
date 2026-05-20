'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, AlertCircle, ExternalLink } from 'lucide-react'
import { Navbar } from '@/components/layout/Navbar'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { reportsApi, authApi } from '@/lib/api'
import { toast } from '@/components/ui/Toaster'
import { formatDate, formatValue, slugify } from '@/lib/utils'
import type { ReportDetail, MetricResult, User } from '@/lib/types'
import { ReportStatus } from '@/lib/types'
import { cn } from '@/lib/utils'

export default function ReportDetailPage() {
  const params = useParams()
  const id = Number(params.id)
  const [user, setUser] = useState<User | null>(null)
  const [report, setReport] = useState<ReportDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [userData, reportData] = await Promise.all([authApi.me(), reportsApi.get(id)])
        setUser(userData)
        setReport(reportData)
      } catch {
        toast('Failed to load report', 'error')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  // Group metrics by panel
  const groupedMetrics: Record<string, MetricResult[]> = {}
  if (report) {
    for (const metric of report.metric_results) {
      const panel = metric.panel_name || 'Uncategorized'
      if (!groupedMetrics[panel]) groupedMetrics[panel] = []
      groupedMetrics[panel].push(metric)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar userEmail={user?.email} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <Link
            href="/reports"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Reports
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : !report ? (
          <div className="text-center py-20 text-gray-500">Report not found.</div>
        ) : (
          <>
            {/* Report header */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-6">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div>
                  <h1 className="text-xl font-bold text-gray-900 break-all">{report.filename}</h1>
                  <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-gray-500">
                    {report.lab_name && <span>{report.lab_name}</span>}
                    {report.report_date && <span>{formatDate(report.report_date)}</span>}
                    <span>{report.metric_results.length} metrics</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={report.status} />
                  {report.status === ReportStatus.NEEDS_REVIEW && (
                    <Link
                      href={`/reports/${report.id}/review`}
                      className="inline-flex items-center gap-1.5 text-sm text-yellow-700 font-medium bg-yellow-50 border border-yellow-200 px-3 py-1.5 rounded-lg hover:bg-yellow-100 transition-colors"
                    >
                      <AlertCircle className="h-4 w-4" />
                      Review Metrics
                    </Link>
                  )}
                </div>
              </div>
            </div>

            {/* Metrics by panel */}
            {Object.entries(groupedMetrics).map(([panel, metrics]) => (
              <div key={panel} className="bg-white rounded-2xl border border-gray-200 shadow-sm mb-5 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
                  <h2 className="font-semibold text-gray-900">{panel}</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          Metric
                        </th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          Raw Name
                        </th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          Value
                        </th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          Reference Range
                        </th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          Status
                        </th>
                        <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          Link
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {metrics.map((metric) => (
                        <tr
                          key={metric.id}
                          className={cn(
                            'hover:bg-gray-50 transition-colors',
                            metric.needs_review && 'bg-yellow-50 hover:bg-yellow-100'
                          )}
                        >
                          <td className="px-5 py-3.5 font-medium text-gray-900">
                            {metric.canonical_name || '—'}
                          </td>
                          <td className="px-5 py-3.5 text-gray-500 text-xs">{metric.raw_name}</td>
                          <td className="px-5 py-3.5 font-semibold">
                            <span
                              className={
                                metric.in_range === false
                                  ? 'text-red-600'
                                  : metric.in_range === true
                                  ? 'text-green-700'
                                  : 'text-gray-900'
                              }
                            >
                              {formatValue(metric.value, metric.unit)}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-gray-500 text-xs">
                            {metric.ref_range_text ||
                              (metric.ref_range_low != null && metric.ref_range_high != null
                                ? `${metric.ref_range_low} – ${metric.ref_range_high}`
                                : '—')}
                          </td>
                          <td className="px-5 py-3.5">
                            {metric.needs_review ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-yellow-700 bg-yellow-100 border border-yellow-200 px-2 py-0.5 rounded-full">
                                <AlertCircle className="h-3 w-3" />
                                Review
                              </span>
                            ) : metric.in_range === true ? (
                              <span className="text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                                In range
                              </span>
                            ) : metric.in_range === false ? (
                              <span className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                                Out of range
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            {metric.canonical_name && (
                              <Link
                                href={`/metrics/${slugify(metric.canonical_name)}`}
                                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                              >
                                <ExternalLink className="h-3 w-3" />
                                History
                              </Link>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </>
        )}
      </main>
    </div>
  )
}
