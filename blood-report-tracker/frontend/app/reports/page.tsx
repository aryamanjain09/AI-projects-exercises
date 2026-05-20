'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  FileText,
  Trash2,
  Eye,
  Upload,
  ArrowLeft,
  AlertCircle,
  FlaskConical,
} from 'lucide-react'
import { Navbar } from '@/components/layout/Navbar'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { reportsApi, authApi } from '@/lib/api'
import { toast } from '@/components/ui/Toaster'
import { formatDate } from '@/lib/utils'
import type { Report, User } from '@/lib/types'
import { ReportStatus } from '@/lib/types'

export default function ReportsPage() {
  const [user, setUser] = useState<User | null>(null)
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const [userData, reportsData] = await Promise.all([authApi.me(), reportsApi.list()])
        setUser(userData)
        setReports(reportsData)
      } catch {
        toast('Failed to load reports', 'error')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function handleDelete(id: number) {
    setDeletingId(id)
    try {
      await reportsApi.delete(id)
      setReports((prev) => prev.filter((r) => r.id !== id))
      toast('Report deleted', 'success')
    } catch {
      toast('Failed to delete report', 'error')
    } finally {
      setDeletingId(null)
      setConfirmDeleteId(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar userEmail={user?.email} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
            <p className="text-sm text-gray-500 mt-0.5">All your uploaded blood test reports</p>
          </div>
          <Link
            href="/upload"
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg px-4 py-2.5 transition-colors"
          >
            <Upload className="h-4 w-4" />
            Upload Report
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="bg-gray-100 p-5 rounded-full mb-4">
              <FlaskConical className="h-10 w-10 text-gray-400" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">No reports yet</h2>
            <p className="text-sm text-gray-500 mb-5">
              Upload your first blood test report to get started.
            </p>
            <Link
              href="/upload"
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg px-5 py-2.5 transition-colors"
            >
              <Upload className="h-4 w-4" />
              Upload Report
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-5 py-3.5 font-semibold text-gray-600 text-xs uppercase tracking-wide">
                      File
                    </th>
                    <th className="text-left px-5 py-3.5 font-semibold text-gray-600 text-xs uppercase tracking-wide">
                      Lab
                    </th>
                    <th className="text-left px-5 py-3.5 font-semibold text-gray-600 text-xs uppercase tracking-wide">
                      Date
                    </th>
                    <th className="text-left px-5 py-3.5 font-semibold text-gray-600 text-xs uppercase tracking-wide">
                      Status
                    </th>
                    <th className="text-left px-5 py-3.5 font-semibold text-gray-600 text-xs uppercase tracking-wide">
                      Metrics
                    </th>
                    <th className="text-right px-5 py-3.5 font-semibold text-gray-600 text-xs uppercase tracking-wide">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {reports.map((report) => (
                    <tr key={report.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-gray-400 flex-shrink-0" />
                          <span className="font-medium text-gray-900 max-w-[200px] truncate">
                            {report.filename}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-gray-600">{report.lab_name || '—'}</td>
                      <td className="px-5 py-4 text-gray-600">
                        {formatDate(report.report_date)}
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge status={report.status} />
                      </td>
                      <td className="px-5 py-4 text-gray-600">{report.metric_count}</td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/reports/${report.id}`}
                            className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium px-2.5 py-1.5 rounded-md hover:bg-blue-50 transition-colors"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            View
                          </Link>
                          {report.status === ReportStatus.NEEDS_REVIEW && (
                            <Link
                              href={`/reports/${report.id}/review`}
                              className="inline-flex items-center gap-1.5 text-xs text-yellow-700 hover:text-yellow-800 font-medium px-2.5 py-1.5 rounded-md hover:bg-yellow-50 transition-colors"
                            >
                              <AlertCircle className="h-3.5 w-3.5" />
                              Review
                            </Link>
                          )}
                          {confirmDeleteId === report.id ? (
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => handleDelete(report.id)}
                                disabled={deletingId === report.id}
                                className="text-xs text-red-600 hover:text-red-700 font-medium px-2.5 py-1.5 rounded-md hover:bg-red-50 transition-colors disabled:opacity-50"
                              >
                                {deletingId === report.id ? 'Deleting…' : 'Confirm'}
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5 rounded-md hover:bg-gray-100 transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDeleteId(report.id)}
                              className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-600 px-2.5 py-1.5 rounded-md hover:bg-red-50 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
