import { cn } from '@/lib/utils'
import { ReportStatus } from '@/lib/types'

interface StatusBadgeProps {
  status: ReportStatus | string
  className?: string
}

const statusConfig: Record<string, { label: string; className: string }> = {
  [ReportStatus.COMPLETE]: {
    label: 'Complete',
    className: 'bg-green-100 text-green-800 border-green-200',
  },
  [ReportStatus.NEEDS_REVIEW]: {
    label: 'Needs Review',
    className: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  },
  [ReportStatus.PROCESSING]: {
    label: 'Processing',
    className: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  [ReportStatus.FAILED]: {
    label: 'Failed',
    className: 'bg-red-100 text-red-800 border-red-200',
  },
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status] ?? {
    label: status,
    className: 'bg-gray-100 text-gray-800 border-gray-200',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border',
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  )
}
