import { format } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import type { OverviewStats } from '../use-overview-stats'

interface SuccessRateChartProps {
  data: OverviewStats['timeSeries']
}

export function SuccessRateChart({ data }: SuccessRateChartProps) {
  const { t } = useTranslation()

  const chartData = data.map((item: OverviewStats['timeSeries'][number]) => {
    const completionsTotal = item.completionsCount
    const embeddingsTotal = item.embeddingsCount
    const completionsFailed = item.completionsFailed
    const embeddingsFailed = item.embeddingsFailed

    const completionsSuccessRate =
      completionsTotal > 0 ? ((completionsTotal - completionsFailed) / completionsTotal) * 100 : 100
    const embeddingsSuccessRate =
      embeddingsTotal > 0 ? ((embeddingsTotal - embeddingsFailed) / embeddingsTotal) * 100 : 100

    return {
      timestamp: item.timestamp,
      completions: Math.round(completionsSuccessRate * 100) / 100,
      embeddings: Math.round(embeddingsSuccessRate * 100) / 100,
    }
  })

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          dataKey="timestamp"
          tickFormatter={(value) => format(new Date(value), 'HH:mm')}
          className="text-xs"
        />
        <YAxis domain={[0, 100]} unit="%" className="text-xs" />
        <Tooltip
          labelFormatter={(value) => format(new Date(value), 'yyyy-MM-dd HH:mm:ss')}
          formatter={(value) => [`${(value as number).toFixed(1)}%`, '']}
          contentStyle={{
            backgroundColor: 'hsl(var(--background))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '6px',
          }}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="completions"
          stroke="hsl(var(--chart-1))"
          name={t('pages.overview.metrics.completions')}
          dot={false}
          strokeWidth={2}
        />
        <Line
          type="monotone"
          dataKey="embeddings"
          stroke="hsl(var(--chart-2))"
          name={t('pages.overview.metrics.embeddings')}
          dot={false}
          strokeWidth={2}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
