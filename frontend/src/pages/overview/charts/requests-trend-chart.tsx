import { memo } from 'react'
import { format } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import type { OverviewStats } from '../use-overview-stats'
import { tooltipContentStyle, tooltipItemStyle, tooltipLabelStyle } from './chart-styles'

interface RequestsTrendChartProps {
  data: OverviewStats['timeSeries']
}

export const RequestsTrendChart = memo(function RequestsTrendChart({ data }: RequestsTrendChartProps) {
  const { t } = useTranslation()

  const chartData = data.map((item: OverviewStats['timeSeries'][number]) => ({
    timestamp: item.timestamp,
    completions: item.completionsCount,
    embeddings: item.embeddingsCount,
  }))

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="timestamp" tickFormatter={(value) => format(new Date(value), 'HH:mm')} className="text-xs" />
        <YAxis className="text-xs" />
        <Tooltip
          labelFormatter={(value) => format(new Date(value), 'yyyy-MM-dd HH:mm:ss')}
          contentStyle={tooltipContentStyle}
          labelStyle={tooltipLabelStyle}
          itemStyle={tooltipItemStyle}
        />
        <Legend />
        <Area
          type="monotone"
          dataKey="completions"
          stackId="1"
          stroke="hsl(var(--chart-1))"
          fill="hsl(var(--chart-1))"
          fillOpacity={0.6}
          name={t('pages.overview.metrics.completions')}
        />
        <Area
          type="monotone"
          dataKey="embeddings"
          stackId="1"
          stroke="hsl(var(--chart-2))"
          fill="hsl(var(--chart-2))"
          fillOpacity={0.6}
          name={t('pages.overview.metrics.embeddings')}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
})
