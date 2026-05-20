'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle, XCircle, Loader2, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { Navbar } from '@/components/layout/Navbar'
import { UploadZone } from '@/components/ui/UploadZone'
import { reportsApi, authApi } from '@/lib/api'
import { toast } from '@/components/ui/Toaster'
import { ReportStatus } from '@/lib/types'
import type { User } from '@/lib/types'

type UploadStage =
  | 'idle'
  | 'uploading'
  | 'extracting'
  | 'analyzing'
  | 'complete'
  | 'failed'

const stageLabels: Record<UploadStage, string> = {
  idle: '',
  uploading: 'Uploading file…',
  extracting: 'Extracting text…',
  analyzing: 'Analyzing with AI…',
  complete: 'Analysis complete!',
  failed: 'Processing failed',
}

const processingStages: UploadStage[] = ['extracting', 'analyzing']

export default function UploadPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [stage, setStage] = useState<UploadStage>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [reportId, setReportId] = useState<number | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const stageIndex = useRef(0)

  useEffect(() => {
    authApi.me().then(setUser).catch(() => {})
  }, [])

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  function startFakeStageAdvance() {
    // Cycle through extracting → analyzing while backend processes
    stageIndex.current = 0
    const stages = processingStages
    setStage(stages[0])
    const interval = setInterval(() => {
      stageIndex.current = (stageIndex.current + 1) % stages.length
      setStage(stages[stageIndex.current])
    }, 3000)
    return interval
  }

  async function handleUpload() {
    if (!selectedFile) return
    setStage('uploading')
    setErrorMessage('')

    try {
      const { report_id } = await reportsApi.upload(selectedFile)
      setReportId(report_id)

      // Start cycling through visual stages
      const fakeInterval = startFakeStageAdvance()

      // Poll for real status
      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await reportsApi.getStatus(report_id)
          if (statusRes.status === ReportStatus.COMPLETE) {
            clearInterval(fakeInterval)
            stopPolling()
            setStage('complete')
            toast('Report analyzed successfully!', 'success')
            setTimeout(() => router.push('/dashboard'), 1200)
          } else if (statusRes.status === ReportStatus.NEEDS_REVIEW) {
            clearInterval(fakeInterval)
            stopPolling()
            setStage('complete')
            toast('Report needs review', 'info')
            setTimeout(() => router.push(`/reports/${report_id}/review`), 1200)
          } else if (statusRes.status === ReportStatus.FAILED) {
            clearInterval(fakeInterval)
            stopPolling()
            setStage('failed')
            setErrorMessage(statusRes.error_message || 'An error occurred during processing.')
          }
        } catch {
          // keep polling
        }
      }, 2000)
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Upload failed. Please try again.'
      setStage('failed')
      setErrorMessage(msg)
      toast(msg, 'error')
    }
  }

  const isProcessing = ['uploading', 'extracting', 'analyzing'].includes(stage)
  const isDone = stage === 'complete' || stage === 'failed'

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar userEmail={user?.email} />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
        <div className="mb-6">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Upload Blood Report</h1>
          <p className="text-sm text-gray-500 mb-8">
            Upload a PDF blood test report. Our AI will extract and analyze your results.
          </p>

          {stage === 'idle' && (
            <>
              <UploadZone onFileSelect={setSelectedFile} />

              {selectedFile && (
                <button
                  onClick={handleUpload}
                  className="mt-6 w-full bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg px-4 py-3 text-sm transition-colors"
                >
                  Analyze Report
                </button>
              )}
            </>
          )}

          {isProcessing && (
            <div className="flex flex-col items-center py-10 gap-5">
              <ProgressRing />
              <div className="text-center">
                <p className="text-lg font-semibold text-gray-900">{stageLabels[stage]}</p>
                <p className="text-sm text-gray-400 mt-1">This may take a minute…</p>
              </div>
              <div className="flex gap-2 mt-2">
                {(['uploading', 'extracting', 'analyzing'] as UploadStage[]).map((s) => (
                  <StepDot key={s} active={stage === s} done={stageOrder(stage) > stageOrder(s)} />
                ))}
              </div>
            </div>
          )}

          {stage === 'complete' && (
            <div className="flex flex-col items-center py-10 gap-4">
              <CheckCircle className="h-16 w-16 text-green-500" />
              <p className="text-lg font-semibold text-gray-900">Analysis Complete!</p>
              <p className="text-sm text-gray-500">Redirecting you now…</p>
            </div>
          )}

          {stage === 'failed' && (
            <div className="flex flex-col items-center py-10 gap-4">
              <XCircle className="h-16 w-16 text-red-500" />
              <p className="text-lg font-semibold text-gray-900">Processing Failed</p>
              {errorMessage && (
                <p className="text-sm text-red-600 text-center max-w-sm">{errorMessage}</p>
              )}
              <button
                onClick={() => {
                  setStage('idle')
                  setSelectedFile(null)
                  setErrorMessage('')
                  setReportId(null)
                }}
                className="mt-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg px-5 py-2.5 transition-colors"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

function ProgressRing() {
  return (
    <div className="relative h-20 w-20">
      <svg className="animate-spin h-20 w-20" viewBox="0 0 80 80">
        <circle
          cx="40"
          cy="40"
          r="34"
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="6"
        />
        <circle
          cx="40"
          cy="40"
          r="34"
          fill="none"
          stroke="#3b82f6"
          strokeWidth="6"
          strokeDasharray="60 154"
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <Loader2 className="h-7 w-7 text-blue-600 animate-spin" />
      </div>
    </div>
  )
}

function StepDot({ active, done }: { active: boolean; done: boolean }) {
  return (
    <div
      className={`h-2.5 w-2.5 rounded-full transition-colors ${
        done ? 'bg-blue-600' : active ? 'bg-blue-400 animate-pulse' : 'bg-gray-200'
      }`}
    />
  )
}

function stageOrder(stage: UploadStage): number {
  const order: Record<UploadStage, number> = {
    idle: 0,
    uploading: 1,
    extracting: 2,
    analyzing: 3,
    complete: 4,
    failed: 4,
  }
  return order[stage]
}
