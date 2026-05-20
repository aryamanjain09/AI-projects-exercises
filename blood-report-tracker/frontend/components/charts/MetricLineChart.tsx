'use client'

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  ReferenceLine,
  Dot,
} from 'recharts'
import { format } from 'date-fns'
import type { MetricHistoryPoint } from '@/lib/types'

interface MetricLineChartProps {
  data: MetricHistoryPoint[]
  metricName: string
  unit?: string | null
  refRangeMin?: number | null
  refRangeMax?: number | null
  height?: number
}

function CustomTooltip({
  active,
  payload,
  unit,
}: {
  active?: boolean
  payload?: Array<{ payload: MetricHistoryPoint; value: number }>
  unit?: string | null
}) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-gray-900">
        {payload[0].value} {unit}
      </p>
      <p className="text-gray-500 text-xs mt-0.5">
        {format(new Date(point.date), 'MMM d, yyyy')}
      </p>
      {point.lab_name && (
        <p className="text-gray-500 text-xs">{point.lab_name}</p>
      )}
      {point.in_range !== null && (
        <p className={`text-xs mt-1 font-medium ${point.in_range ? 'text-green-600' : 'text-red-600'}`}>
          {point.in_range ? 'In range' : 'Out of range'}
        </p>
      )}
    </div>
  )
}

function CustomDot(props: {
  cx?: number
  cy?: number
  payload?: MetricHistoryPoint
}) {
  const { cx, cy, payload } = props
  if (cx === undefined || cy === undefined) return null
  const color =
    payload?.in_range === true
      ? '#16a34a'
      : payload?.in_range === false
      ? '#dc2626'
      : '#3b82f6'
  return <Dot cx={cx} cy={cy} r={5} fill={color} stroke="white" strokeWidth={2} />
}

export function MetricLineChart({
  data,
  metricName,
  unit,
  refRangeMin,
  refRangeMax,
  height = 300,
}: MetricLineChartProps) {
  const sortedData = [...data].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  )

  const chartData = sortedData.map((d) => ({
    ...d,
    dateLabel: format(new Date(d.date), 'MMM d'),
    fullDate: d.date,
  }))

  const allValues = sortedData.map((d) => d.value).filter((v) => v != null) as number[]
  const minVal = Math.min(...allValues, refRangeMin ?? Infinity)
  const maxVal = Math.max(...allValues, refRangeMax ?? -Infinity)
  const padding = (maxVal - minVal) * 0.15 || 1
  const yMin = Math.max(0, minVal - padding)
  const yMax = maxVal + padding

  if (!chartData.length) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center text-gray-400 text-sm"
      >
        No data available
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="dateLabel"
          tick={{ fontSize: 11, fill: '#6b7280' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={[yMin, yMax]}
          tick={{ fontSize: 11, fill: '#6b7280' }}
          axisLine={false}
          tickLine={false}
          width={50}
          tickFormatter={(v) => `${v}${unit ? ' ' + unit : ''}`}
        />
        <Tooltip content={<CustomTooltip unit={unit} />} />

        {/* Reference range band */}
        {refRangeMin != null && refRangeMax != null && (
          <ReferenceArea
            y1={refRangeMin}
            y2={refRangeMax}
            fill="#dcfce7"
            fillOpacity={0.5}
            strokeOpacity={0}
          />
        )}
        {refRangeMin != null && (
          <ReferenceLine
            y={refRangeMin}
            stroke="#86efac"
            strokeDasharray="4 2"
            label={{ value: 'Low', position: 'insideBottomLeft', fontSize: 10, fill: '#16a34a' }}
          />
        )}
        {refRangeMax != null && (
          <ReferenceLine
            y={refRangeMax}
            stroke="#86efac"
            strokeDasharray="4 2"
            label={{ value: 'High', position: 'insideTopLeft', fontSize: 10, fill: '#16a34a' }}
          />
        )}

        <Line
          type="monotone"
          dataKey="value"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={<CustomDot />}
          activeDot={{ r: 7 }}
          name={metricName}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
