import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

import type { OverviewStats } from '../use-overview-stats'
import { tooltipContentStyle, tooltipItemStyle, tooltipLabelStyle } from './chart-styles'

interface ModelDistributionChartProps {
  data: OverviewStats['modelDistribution']
}

const COLORS = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
  'var(--color-chart-5)',
  'var(--color-chart-6)',
  'var(--color-chart-7)',
  'var(--color-chart-8)',
  'var(--color-chart-9)',
  'var(--color-chart-10)',
]

export const ModelDistributionChart = memo(function ModelDistributionChart({
  data,
}: ModelDistributionChartProps) {
  const { t } = useTranslation()

  if (data.length === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center text-muted-foreground">
        {t('pages.overview.noData')}
      </div>
    )
  }

  type ChartDataItem = { name: string | null; value: number; type: 'chat' | 'embedding' }
  type ModelDistributionItem = OverviewStats['modelDistribution'][number]

  const chartData: ChartDataItem[] = data.map((item: ModelDistributionItem) => ({
    name: item.model,
    value: item.count,
    type: item.type,
  }))

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          labelLine={false}
          outerRadius={100}
          fill="#8884d8"
          dataKey="value"
          nameKey="name"
          label={({ name, percent }) => `${name ?? ''} (${((percent ?? 0) * 100).toFixed(0)}%)`}
        >
          {chartData.map((_entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={tooltipContentStyle}
          labelStyle={tooltipLabelStyle}
          itemStyle={tooltipItemStyle}
        />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  )
})
