'use client'

import './globals.css'
import { Inter } from 'next/font/google'
import { Toaster } from '@/components/ui/Toaster'

const inter = Inter({ subsets: ['latin'] })

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <title>Blood Report Tracker</title>
        <meta name="description" content="Track and analyze your blood test results over time" />
      </head>
      <body className={`${inter.className} min-h-screen bg-gray-50 antialiased`}>
        {children}
        <Toaster />
      </body>
    </html>
  )
}
