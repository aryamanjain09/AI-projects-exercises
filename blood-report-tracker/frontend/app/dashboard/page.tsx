'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Upload,
  FlaskConical,
  AlertTriangle,
  Calendar,
  Layers,
  ChevronRight,
} from 'lucide-react'
import { Navbar } from '@/components/layout/Navbar'
import { MetricCard } from '@/components/ui/MetricCard'
import { metricsApi, authApi } from '@/lib/api'
import { toast } from '@/components/ui/Toaster'
import { slugify, formatDate } from '@/lib/utils'
import type { PanelSummary, MetricSummaryItem, User } from '@/lib/types'
import { TrendDirection } from '@/lib/types'

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [panels, setPanels] = useState<PanelSummary[]>([])
  const [summary, setSummary] = useState<MetricSummaryItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [userData, panelsData, summaryData] = await Promise.all([
          authApi.me(),
          metricsApi.getPanels(),
          metricsApi.getSummary(),
        ])
        setUser(userData)
        setPanels(panelsData)
        setSummary(summaryData)
      } catch {
        toast('Failed to load dashboard data', 'error')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const totalReports = summary.reduce((acc, m) => acc + (m.data_points > 0 ? 1 : 0), 0)
  const outOfRangeCount = summary.filter((m) => m.in_range === false).length
  const panelCount = panels.length

  const dates = summary
    .filter((m) => m.latest_date)
    .map((m) => new Date(m.latest_date!).getTime())
  const dateRange =
    dates.length >= 2
      ? `${formatDate(new Date(Math.min(...dates)).toISOString())} – ${formatDate(new Date(Math.max(...dates)).toISOString())}`
      : dates.length === 1
      ? formatDate(new Date(dates[0]).toISOString())
      : '—'

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar userEmail={user?.email} />
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      </div>
    )
  }

  const hasData = panels.length > 0

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar userEmail={user?.email} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Welcome back{user ? `, ${user.email}` : ''}
            </p>
          </div>
          <Link
            href="/upload"
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg px-4 py-2.5 transition-colors"
          >
            <Upload className="h-4 w-4" />
            Upload Report
          </Link>
        </div>

        {hasData ? (
          <>
            {/* Stats row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <StatCard
                icon={<FlaskConical className="h-5 w-5 text-blue-600" />}
                label="Total Reports"
                value={String(totalReports)}
                bg="bg-blue-50"
              />
              <StatCard
                icon={<Calendar className="h-5 w-5 text-purple-600" />}
                label="Date Range"
                value={dateRange}
                bg="bg-purple-50"
                small
              />
              <StatCard
                icon={<Layers className="h-5 w-5 text-indigo-600" />}
                label="Panels Tracked"
                value={String(panelCount)}
                bg="bg-indigo-50"
              />
              <StatCard
                icon={<AlertTriangle className="h-5 w-5 text-red-600" />}
                label="Out of Range"
                value={String(outOfRangeCount)}
                bg="bg-red-50"
                valueColor={outOfRangeCount > 0 ? 'text-red-700' : 'text-gray-900'}
              />
            </div>

            {/* Panels */}
            <div className="space-y-8">
              {panels.map((panel) => (
                <div key={panel.panel_name}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold text-gray-900">{panel.panel_name}</h2>
                      {panel.out_of_range_count > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                          <AlertTriangle className="h-3 w-3" />
                          {panel.out_of_range_count} out of range
                        </span>
                      )}
                    </div>
                    <Link
                      href={`/panels/${slugify(panel.panel_name)}`}
                      className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-0.5"
                    >
                      View panel <ChevronRight className="h-4 w-4" />
                    </Link>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                    {panel.metrics.map((metric) => (
                      <MetricCard
                        key={metric.canonical_name}
                        canonicalName={metric.canonical_name}
                        latestValue={metric.latest_value}
                        unit={metric.latest_unit}
                        inRange={metric.in_range}
                        trend={metric.trend ?? TrendDirection.STABLE}
                        panelName={panel.panel_name}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="bg-blue-50 p-6 rounded-full mb-6">
              <FlaskConical className="h-12 w-12 text-blue-500" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">No reports yet</h2>
            <p className="text-gray-500 mb-6 max-w-sm">
              Upload your first blood test PDF to start tracking your health metrics over time.
            </p>
            <Link
              href="/upload"
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg px-6 py-3 transition-colors"
            >
              <Upload className="h-5 w-5" />
              Upload your first report
            </Link>
          </div>
        )}
      </main>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  bg,
  small,
  valueColor = 'text-gray-900',
}: {
  icon: React.ReactNode
  label: string
  value: string
  bg: string
  small?: boolean
  valueColor?: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className={`inline-flex p-2 rounded-lg ${bg} mb-3`}>{icon}</div>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`${small ? 'text-sm' : 'text-2xl'} font-bold mt-1 ${valueColor}`}>{value}</p>
    </div>
  )
}
