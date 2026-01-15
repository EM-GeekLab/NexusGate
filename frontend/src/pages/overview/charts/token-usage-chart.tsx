import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import type { OverviewStats } from '../use-overview-stats'
import { tooltipContentStyle, tooltipItemStyle, tooltipLabelStyle } from './chart-styles'

interface TokenUsageChartProps {
  data: OverviewStats['tokenUsage']
}

export const TokenUsageChart = memo(function TokenUsageChart({ data }: TokenUsageChartProps) {
  const { t } = useTranslation()

  const chartData = [
    {
      name: t('pages.overview.tokens.prompt'),
      value: data.promptTokens,
    },
    {
      name: t('pages.overview.tokens.completion'),
      value: data.completionTokens,
    },
    {
      name: t('pages.overview.tokens.embedding'),
      value: data.embeddingTokens,
    },
  ]

  const formatValue = (value: number) => {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`
    }
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}K`
    }
    return value.toString()
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis type="number" tickFormatter={formatValue} className="text-xs" />
        <YAxis type="category" dataKey="name" className="text-xs" width={80} />
        <Tooltip
          formatter={(value) => [(value as number).toLocaleString(), 'Tokens']}
          contentStyle={tooltipContentStyle}
          labelStyle={tooltipLabelStyle}
          itemStyle={tooltipItemStyle}
        />
        <Bar dataKey="value" fill="hsl(var(--chart-1))" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
})
