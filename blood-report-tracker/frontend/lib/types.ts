export interface User {
  id: number
  email: string
  created_at: string
}

export enum ReportStatus {
  PROCESSING = 'processing',
  COMPLETE = 'complete',
  NEEDS_REVIEW = 'needs_review',
  FAILED = 'failed',
}

export interface Report {
  id: number
  filename: string
  lab_name: string | null
  report_date: string | null
  status: ReportStatus
  metric_count: number
  created_at: string
  error_message?: string | null
}

export interface MetricResult {
  id: number
  report_id: number
  raw_name: string
  canonical_name: string | null
  panel_name: string | null
  value: number | null
  unit: string | null
  ref_range_low: number | null
  ref_range_high: number | null
  ref_range_text: string | null
  in_range: boolean | null
  needs_review: boolean
  confidence_score: number | null
  extracted_text: string | null
}

export interface ReportDetail extends Report {
  metric_results: MetricResult[]
}

export interface MetricUpdate {
  metric_id: number
  value?: number | null
  unit?: string | null
  ref_range_low?: number | null
  ref_range_high?: number | null
}

export interface CanonicalMetric {
  canonical_name: string
  panel_name: string
  unit: string | null
  ref_range_low: number | null
  ref_range_high: number | null
}

export enum TrendDirection {
  UP = 'up',
  DOWN = 'down',
  STABLE = 'stable',
}

export interface PanelSummary {
  panel_name: string
  metric_count: number
  out_of_range_count: number
  metrics: PanelMetricSummary[]
}

export interface PanelMetricSummary {
  canonical_name: string
  latest_value: number | null
  latest_unit: string | null
  in_range: boolean | null
  trend: TrendDirection
  latest_date: string | null
}

export interface MetricSummaryItem {
  canonical_name: string
  panel_name: string
  latest_value: number | null
  latest_unit: string | null
  in_range: boolean | null
  trend: TrendDirection
  latest_date: string | null
  data_points: number
}

export interface MetricHistoryPoint {
  date: string
  value: number
  unit: string | null
  ref_range_low: number | null
  ref_range_high: number | null
  in_range: boolean | null
  report_id: number
  lab_name: string | null
}
