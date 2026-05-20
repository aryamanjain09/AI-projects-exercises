'use client'

import { ResponsiveContainer, LineChart, Line } from 'recharts'
import type { MetricHistoryPoint } from '@/lib/types'

interface SparklineChartProps {
  data: MetricHistoryPoint[]
  color?: string
  height?: number
}

export function SparklineChart({ data, color = '#3b82f6', height = 40 }: SparklineChartProps) {
  const sortedData = [...data]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((d) => ({ value: d.value }))

  if (sortedData.length < 2) {
    return <div style={{ height }} className="flex items-center justify-center text-xs text-gray-300">—</div>
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={sortedData}>
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
