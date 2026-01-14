import { useTranslation } from 'react-i18next'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

import type { TimeRange } from './use-overview-stats'

const TIME_RANGES: { value: TimeRange; labelKey: string }[] = [
  { value: '1m', labelKey: 'pages.overview.timeRange.1m' },
  { value: '5m', labelKey: 'pages.overview.timeRange.5m' },
  { value: '10m', labelKey: 'pages.overview.timeRange.10m' },
  { value: '30m', labelKey: 'pages.overview.timeRange.30m' },
  { value: '1h', labelKey: 'pages.overview.timeRange.1h' },
  { value: '4h', labelKey: 'pages.overview.timeRange.4h' },
  { value: '12h', labelKey: 'pages.overview.timeRange.12h' },
]

interface TimeRangeSelectProps {
  value: TimeRange
  onChange: (value: TimeRange) => void
}

export function TimeRangeSelect({ value, onChange }: TimeRangeSelectProps) {
  const { t } = useTranslation()

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[140px]">
        <SelectValue placeholder={t('pages.overview.selectTimeRange')} />
      </SelectTrigger>
      <SelectContent>
        {TIME_RANGES.map((range) => (
          <SelectItem key={range.value} value={range.value}>
            {t(range.labelKey)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
