import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export type TimeRangePreset = '15m' | '1h' | '4h' | '12h' | '24h' | '7d' | '30d'

/** Milliseconds for each time range preset. */
export const TIME_RANGE_MS: Record<TimeRangePreset, number> = {
  '15m': 15 * 60_000,
  '1h': 3600_000,
  '4h': 4 * 3600_000,
  '12h': 12 * 3600_000,
  '24h': 24 * 3600_000,
  '7d': 7 * 86400_000,
  '30d': 30 * 86400_000,
}

/** Compute from/to ISO strings for a preset relative to now. */
export function getTimeRangeISO(preset: TimeRangePreset): { from: string; to: string } {
  const now = new Date()
  return {
    from: new Date(now.getTime() - TIME_RANGE_MS[preset]).toISOString(),
    to: now.toISOString(),
  }
}

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
