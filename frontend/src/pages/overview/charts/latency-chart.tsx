import { format } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import type { OverviewStats } from '../use-overview-stats'

interface LatencyChartProps {
  data: OverviewStats['timeSeries']
}

export function LatencyChart({ data }: LatencyChartProps) {
  const { t } = useTranslation()

  const chartData = data.map((item: OverviewStats['timeSeries'][number]) => ({
    timestamp: item.timestamp,
    duration: Math.round(item.avgDuration),
    ttft: Math.round(item.avgTTFT),
  }))

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          dataKey="timestamp"
          tickFormatter={(value) => format(new Date(value), 'HH:mm')}
          className="text-xs"
        />
        <YAxis yAxisId="left" unit="ms" className="text-xs" />
        <YAxis yAxisId="right" orientation="right" unit="ms" className="text-xs" />
        <Tooltip
          labelFormatter={(value) => format(new Date(value), 'yyyy-MM-dd HH:mm:ss')}
          contentStyle={{
            backgroundColor: 'hsl(var(--background))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '6px',
          }}
        />
        <Legend />
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="duration"
          stroke="hsl(var(--chart-3))"
          name={t('pages.overview.metrics.avgLatency')}
          dot={false}
          strokeWidth={2}
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="ttft"
          stroke="hsl(var(--chart-4))"
          name={t('pages.overview.metrics.avgTTFT')}
          dot={false}
          strokeWidth={2}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
