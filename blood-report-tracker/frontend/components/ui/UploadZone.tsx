'use client'

import { useRef, useState } from 'react'
import { Upload, FileText, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface UploadZoneProps {
  onFileSelect: (file: File) => void
  disabled?: boolean
  className?: string
}

const MAX_SIZE_MB = 20
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024

export function UploadZone({ onFileSelect, disabled, className }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState('')

  function validateAndSelect(file: File) {
    setFileError('')
    if (file.type !== 'application/pdf') {
      setFileError('Only PDF files are supported.')
      return
    }
    if (file.size > MAX_SIZE_BYTES) {
      setFileError(`File is too large. Maximum size is ${MAX_SIZE_MB}MB.`)
      return
    }
    setSelectedFile(file)
    onFileSelect(file)
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    if (!disabled) setDragging(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    if (disabled) return
    const file = e.dataTransfer.files[0]
    if (file) validateAndSelect(file)
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) validateAndSelect(file)
  }

  function clearFile() {
    setSelectedFile(null)
    setFileError('')
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className={className}>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        className={cn(
          'relative flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-10 transition-colors',
          disabled
            ? 'opacity-50 cursor-not-allowed border-gray-200 bg-gray-50'
            : dragging
            ? 'border-blue-500 bg-blue-50 cursor-copy'
            : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50 cursor-pointer'
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={handleInputChange}
          disabled={disabled}
        />

        {selectedFile ? (
          <div className="flex flex-col items-center gap-3">
            <div className="bg-blue-100 p-4 rounded-full">
              <FileText className="h-8 w-8 text-blue-600" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-900">{selectedFile.name}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
              </p>
            </div>
            {!disabled && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  clearFile()
                }}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-600 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
                Remove file
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="bg-gray-100 p-4 rounded-full">
              <Upload className="h-8 w-8 text-gray-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-700">
                Drop your PDF here, or{' '}
                <span className="text-blue-600">click to browse</span>
              </p>
              <p className="text-xs text-gray-400 mt-1">PDF files only, max {MAX_SIZE_MB}MB</p>
            </div>
          </div>
        )}
      </div>

      {fileError && (
        <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
          <X className="h-3.5 w-3.5" />
          {fileError}
        </p>
      )}
    </div>
  )
}
