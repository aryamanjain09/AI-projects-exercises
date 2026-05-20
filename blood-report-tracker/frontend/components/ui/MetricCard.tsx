'use client'

import Link from 'next/link'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn, slugify, formatValue } from '@/lib/utils'
import { TrendDirection } from '@/lib/types'

interface MetricCardProps {
  canonicalName: string
  latestValue: number | null
  unit: string | null
  inRange: boolean | null
  trend: TrendDirection
  panelName?: string
  className?: string
}

function TrendIcon({ trend }: { trend: TrendDirection }) {
  if (trend === TrendDirection.UP)
    return <TrendingUp className="h-4 w-4 text-blue-500" />
  if (trend === TrendDirection.DOWN)
    return <TrendingDown className="h-4 w-4 text-blue-500" />
  return <Minus className="h-4 w-4 text-gray-400" />
}

function rangeBorderClass(inRange: boolean | null) {
  if (inRange === true) return 'border-l-green-400'
  if (inRange === false) return 'border-l-red-400'
  return 'border-l-gray-300'
}

function rangeTextClass(inRange: boolean | null) {
  if (inRange === true) return 'text-green-700'
  if (inRange === false) return 'text-red-700'
  return 'text-gray-600'
}

export function MetricCard({
  canonicalName,
  latestValue,
  unit,
  inRange,
  trend,
  panelName,
  className,
}: MetricCardProps) {
  const slug = slugify(canonicalName)

  return (
    <Link href={`/metrics/${slug}`}>
      <div
        className={cn(
          'bg-white rounded-xl border border-gray-200 border-l-4 p-4 hover:shadow-md transition-shadow cursor-pointer',
          rangeBorderClass(inRange),
          className
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-500 font-medium truncate">{panelName}</p>
            <p className="text-sm font-semibold text-gray-900 mt-0.5 leading-tight">
              {canonicalName}
            </p>
          </div>
          <TrendIcon trend={trend} />
        </div>

        <div className="mt-3">
          <span className={cn('text-xl font-bold', rangeTextClass(inRange))}>
            {formatValue(latestValue)}
          </span>
          {unit && <span className="text-sm text-gray-400 ml-1">{unit}</span>}
        </div>

        <div className="mt-1">
          {inRange === true && (
            <span className="text-xs text-green-600 font-medium">In range</span>
          )}
          {inRange === false && (
            <span className="text-xs text-red-600 font-medium">Out of range</span>
          )}
          {inRange === null && (
            <span className="text-xs text-gray-400">No reference range</span>
          )}
        </div>
      </div>
    </Link>
  )
}
