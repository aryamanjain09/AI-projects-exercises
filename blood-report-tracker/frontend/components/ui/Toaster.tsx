'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: string
  message: string
  type: ToastType
}

// Simple global toast store
let toastListeners: Array<(toasts: Toast[]) => void> = []
let toasts: Toast[] = []

function notifyListeners() {
  toastListeners.forEach((fn) => fn([...toasts]))
}

export function toast(message: string, type: ToastType = 'info') {
  const id = Math.random().toString(36).slice(2)
  toasts = [...toasts, { id, message, type }]
  notifyListeners()
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id)
    notifyListeners()
  }, 4000)
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([])

  useEffect(() => {
    const listener = (updated: Toast[]) => setItems(updated)
    toastListeners.push(listener)
    return () => {
      toastListeners = toastListeners.filter((l) => l !== listener)
    }
  }, [])

  if (items.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-full max-w-sm">
      {items.map((item) => (
        <div
          key={item.id}
          className={cn(
            'flex items-start gap-3 rounded-lg px-4 py-3 shadow-lg text-sm font-medium text-white',
            item.type === 'success' && 'bg-green-600',
            item.type === 'error' && 'bg-red-600',
            item.type === 'warning' && 'bg-yellow-500',
            item.type === 'info' && 'bg-blue-600'
          )}
        >
          <span className="flex-1">{item.message}</span>
          <button
            onClick={() => {
              toasts = toasts.filter((t) => t.id !== item.id)
              notifyListeners()
            }}
            className="opacity-70 hover:opacity-100 transition-opacity"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
