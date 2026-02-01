import { useMemo } from 'react'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export type TimeRangePreset = '15m' | '1h' | '4h' | '12h' | '24h' | '7d' | '30d'

const TIME_RANGES: { value: TimeRangePreset; label: string }[] = [
  { value: '15m', label: 'Last 15 min' },
  { value: '1h', label: 'Last 1 hour' },
  { value: '4h', label: 'Last 4 hours' },
  { value: '12h', label: 'Last 12 hours' },
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
]

interface TimeRangePickerProps {
  value: TimeRangePreset
  onChange: (value: TimeRangePreset) => void
}

export function TimeRangePicker({ value, onChange }: TimeRangePickerProps) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as TimeRangePreset)}>
      <SelectTrigger className="w-[140px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TIME_RANGES.map((range) => (
          <SelectItem key={range.value} value={range.value}>
            {range.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/**
 * Convert a time range preset to from/to Date objects.
 */
export function useTimeRangeDates(preset: TimeRangePreset): { from: string; to: string } {
  return useMemo(() => {
    const now = new Date()
    const to = now.toISOString()

    const ms: Record<TimeRangePreset, number> = {
      '15m': 15 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '4h': 4 * 60 * 60 * 1000,
      '12h': 12 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
    }

    const from = new Date(now.getTime() - ms[preset]).toISOString()
    return { from, to }
  }, [preset])
}

/**
 * Get the appropriate bucket size in seconds for a given time range preset.
 */
export function getBucketSeconds(preset: TimeRangePreset): number {
  const buckets: Record<TimeRangePreset, number> = {
    '15m': 15,      // 15s buckets → ~60 bars
    '1h': 60,       // 1min buckets → 60 bars
    '4h': 240,      // 4min buckets → 60 bars
    '12h': 720,     // 12min buckets → 60 bars
    '24h': 1800,    // 30min buckets → 48 bars
    '7d': 10800,    // 3h buckets → 56 bars
    '30d': 43200,   // 12h buckets → 60 bars
  }
  return buckets[preset]
}
