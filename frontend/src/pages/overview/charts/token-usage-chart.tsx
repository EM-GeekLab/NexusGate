import { useTranslation } from 'react-i18next'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import type { OverviewStats } from '../use-overview-stats'

interface TokenUsageChartProps {
  data: OverviewStats['tokenUsage']
}

export function TokenUsageChart({ data }: TokenUsageChartProps) {
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
          contentStyle={{
            backgroundColor: 'hsl(var(--background))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '6px',
          }}
        />
        <Bar dataKey="value" fill="hsl(var(--chart-1))" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
