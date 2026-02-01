import { useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { XIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { QueryInput } from '@/pages/search/query-input'
import { TimeRangePicker, getTimeRangeISO, type TimeRangePreset } from '@/pages/search/time-range-picker'
import { ExportButton } from '@/pages/search/export-button'

export function SearchBar() {
  const { q, range, ...rest } = useSearch({ from: '/requests/' })
  const navigate = useNavigate()

  const [queryText, setQueryText] = useState(q ?? '')

  const handleSubmit = () => {
    const trimmed = queryText.trim()
    navigate({
      to: '/requests',
      search: {
        ...rest,
        q: trimmed || undefined,
        range: range ?? '24h',
        page: 1, // Reset to first page on new search
      },
    })
  }

  const handleClear = () => {
    setQueryText('')
    navigate({
      to: '/requests',
      search: {
        ...rest,
        q: undefined,
        page: 1,
      },
    })
  }

  const handleRangeChange = (value: TimeRangePreset) => {
    navigate({
      to: '/requests',
      search: {
        ...rest,
        q,
        range: value,
        page: 1,
      },
    })
  }

  const isSearching = !!q?.trim()

  const timeRange = isSearching
    ? getTimeRangeISO((range as TimeRangePreset) ?? '24h')
    : undefined

  return (
    <div className="flex items-center gap-2 border-b px-4 py-2">
      <QueryInput value={queryText} onChange={setQueryText} onSubmit={handleSubmit} className="flex-1" />
      <TimeRangePicker value={(range as TimeRangePreset) ?? '24h'} onChange={handleRangeChange} />
      {isSearching && (
        <>
          <ExportButton query={q!} timeRange={timeRange} />
          <Button variant="ghost" size="sm" onClick={handleClear}>
            <XIcon className="mr-1 size-3.5" />
            Clear
          </Button>
        </>
      )}
    </div>
  )
}
