'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { Navbar } from '@/components/layout/Navbar'
import { MetricLineChart } from '@/components/charts/MetricLineChart'
import { SparklineChart } from '@/components/charts/SparklineChart'
import { metricsApi, authApi } from '@/lib/api'
import { toast } from '@/components/ui/Toaster'
import { unslugify, slugify, formatValue } from '@/lib/utils'
import type { PanelSummary, MetricHistoryPoint, User } from '@/lib/types'
import { TrendDirection } from '@/lib/types'
import { cn } from '@/lib/utils'

interface MetricHistory {
  name: string
  data: MetricHistoryPoint[]
  visible: boolean
  unit: string | null
  refLow: number | null
  refHigh: number | null
}

export default function PanelPage() {
  const params = useParams()
  const panelSlug = params.panel as string
  const panelName = unslugify(panelSlug)

  const [user, setUser] = useState<User | null>(null)
  const [panel, setPanel] = useState<PanelSummary | null>(null)
  const [histories, setHistories] = useState<MetricHistory[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [userData, panels] = await Promise.all([authApi.me(), metricsApi.getPanels()])
        setUser(userData)

        // Find matching panel (case-insensitive slug comparison)
        const found = panels.find(
          (p) => slugify(p.panel_name) === panelSlug
        )
        if (!found) {
          setLoading(false)
          return
        }
        setPanel(found)

        // Fetch history for each metric
        const historyResults = await Promise.all(
          found.metrics.map(async (metric) => {
            try {
              const data = await metricsApi.getHistory(metric.canonical_name)
              const refLow = data[0]?.ref_range_low ?? null
              const refHigh = data[0]?.ref_range_high ?? null
              return {
                name: metric.canonical_name,
                data,
                visible: true,
                unit: metric.latest_unit,
                refLow,
                refHigh,
              }
            } catch {
              return {
                name: metric.canonical_name,
                data: [],
                visible: true,
                unit: metric.latest_unit,
                refLow: null,
                refHigh: null,
              }
            }
          })
        )
        setHistories(historyResults)
      } catch {
        toast('Failed to load panel data', 'error')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [panelSlug])

  function toggleMetric(name: string) {
    setHistories((prev) =>
      prev.map((h) => (h.name === name ? { ...h, visible: !h.visible } : h))
    )
  }

  const visibleHistories = histories.filter((h) => h.visible)

  // Build combined chart data (multi-line)
  const allDates = [
    ...new Set(
      visibleHistories.flatMap((h) => h.data.map((d) => d.date.split('T')[0]))
    ),
  ].sort()

  const COLORS = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
    '#06b6d4', '#84cc16', '#f97316', '#ec4899', '#6366f1',
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar userEmail={user?.email} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
        ) : !panel ? (
          <div className="text-center py-20 text-gray-500">Panel not found.</div>
        ) : (
          <>
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-gray-900">{panel.panel_name}</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                {panel.metric_count} metric{panel.metric_count !== 1 ? 's' : ''}
                {panel.out_of_range_count > 0 && (
                  <span className="text-red-600 ml-2">
                    · {panel.out_of_range_count} out of range
                  </span>
                )}
              </p>
            </div>

            {/* Multi-line chart */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-8">
              <div className="flex flex-wrap items-center gap-2 mb-5">
                <span className="text-sm font-semibold text-gray-700 mr-2">Toggle metrics:</span>
                {histories.map((h, i) => (
                  <button
                    key={h.name}
                    onClick={() => toggleMetric(h.name)}
                    className={cn(
                      'flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-all',
                      h.visible
                        ? 'text-white border-transparent'
                        : 'text-gray-500 bg-white border-gray-300 hover:border-gray-400'
                    )}
                    style={
                      h.visible ? { backgroundColor: COLORS[i % COLORS.length] } : undefined
                    }
                  >
                    {h.name}
                  </button>
                ))}
              </div>

              {visibleHistories.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
                  Select at least one metric to display
                </div>
              ) : (
                <MultiLinePanel histories={visibleHistories} colors={COLORS} />
              )}
            </div>

            {/* Individual metric cards */}
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Individual Metrics</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {panel.metrics.map((metric, i) => {
                const history = histories.find((h) => h.name === metric.canonical_name)
                return (
                  <Link key={metric.canonical_name} href={`/metrics/${slugify(metric.canonical_name)}`}>
                    <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between mb-1">
                        <h3 className="font-semibold text-gray-900 text-sm leading-tight">
                          {metric.canonical_name}
                        </h3>
                        <TrendIcon trend={metric.trend ?? TrendDirection.STABLE} />
                      </div>
                      <p
                        className={cn(
                          'text-xl font-bold mt-1',
                          metric.in_range === false
                            ? 'text-red-600'
                            : metric.in_range === true
                            ? 'text-green-700'
                            : 'text-gray-900'
                        )}
                      >
                        {formatValue(metric.latest_value, metric.latest_unit)}
                      </p>
                      {history && history.data.length >= 2 && (
                        <div className="mt-3">
                          <SparklineChart
                            data={history.data}
                            color={COLORS[i % COLORS.length]}
                            height={40}
                          />
                        </div>
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>
          </>
        )}
      </main>
    </div>
  )
}

function TrendIcon({ trend }: { trend: TrendDirection }) {
  if (trend === TrendDirection.UP)
    return <TrendingUp className="h-4 w-4 text-blue-500 flex-shrink-0" />
  if (trend === TrendDirection.DOWN)
    return <TrendingDown className="h-4 w-4 text-blue-500 flex-shrink-0" />
  return <Minus className="h-4 w-4 text-gray-400 flex-shrink-0" />
}

// Multi-line recharts panel
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { format } from 'date-fns'

function MultiLinePanel({
  histories,
  colors,
}: {
  histories: MetricHistory[]
  colors: string[]
}) {
  // Build unified date-keyed data points
  const dateMap: Record<string, Record<string, number>> = {}
  histories.forEach((h) => {
    h.data.forEach((d) => {
      const key = d.date.split('T')[0]
      if (!dateMap[key]) dateMap[key] = {}
      dateMap[key][h.name] = d.value
    })
  })
  const chartData = Object.entries(dateMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({
      date,
      label: format(new Date(date), 'MMM d'),
      ...values,
    }))

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: '#6b7280' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#6b7280' }}
          axisLine={false}
          tickLine={false}
          width={45}
        />
        <Tooltip
          contentStyle={{
            fontSize: 12,
            borderRadius: 8,
            border: '1px solid #e5e7eb',
          }}
        />
        <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
        {histories.map((h, i) => (
          <Line
            key={h.name}
            type="monotone"
            dataKey={h.name}
            stroke={colors[i % colors.length]}
            strokeWidth={2}
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
