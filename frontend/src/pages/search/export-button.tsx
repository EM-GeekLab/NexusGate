import { useState } from 'react'
import { DownloadIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

interface ExportButtonProps {
  query: string
  timeRange?: { from: string; to: string }
  disabled?: boolean
}

export function ExportButton({ query, timeRange, disabled }: ExportButtonProps) {
  const [loading, setLoading] = useState(false)

  const handleExport = async (format: 'csv' | 'json') => {
    setLoading(true)
    try {
      const backendBaseURL = import.meta.env.PROD ? location.origin : import.meta.env.VITE_BASE_URL
      const adminSecret = localStorage.getItem('admin-secret')
      if (!adminSecret) return

      const response = await fetch(`${backendBaseURL}/api/admin/search/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${JSON.parse(adminSecret)}`,
        },
        body: JSON.stringify({ query, timeRange, format }),
      })

      if (!response.ok) throw new Error('Export failed')

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `search-results.${format}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export failed', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled || loading || !query.trim()}>
          <DownloadIcon className="mr-1 size-3.5" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleExport('csv')}>Export as CSV</DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport('json')}>Export as JSON</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
