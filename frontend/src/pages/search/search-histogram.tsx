import { memo } from 'react'
import { format } from 'date-fns'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { tooltipContentStyle, tooltipItemStyle, tooltipLabelStyle } from '@/pages/overview/charts/chart-styles'

interface HistogramBucket {
  bucket: string | Date
  total: string
  completed: string
  failed: string
}

interface SearchHistogramProps {
  data: HistogramBucket[]
}

export const SearchHistogram = memo(function SearchHistogram({ data }: SearchHistogramProps) {
  const chartData = data.map((item) => ({
    timestamp: typeof item.bucket === 'string' ? item.bucket : item.bucket.toISOString(),
    completed: Number(item.completed) || 0,
    failed: Number(item.failed) || 0,
    other: Math.max(0, (Number(item.total) || 0) - (Number(item.completed) || 0) - (Number(item.failed) || 0)),
  }))

  if (chartData.length === 0) return null

  return (
    <div className="border-b px-4 py-3">
      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={chartData} barCategoryGap={1}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
          <XAxis
            dataKey="timestamp"
            tickFormatter={(value) => format(new Date(value), 'HH:mm')}
            className="text-xs"
            tickLine={false}
            axisLine={false}
          />
          <YAxis className="text-xs" width={40} tickLine={false} axisLine={false} />
          <Tooltip
            labelFormatter={(value) => format(new Date(value), 'yyyy-MM-dd HH:mm:ss')}
            contentStyle={tooltipContentStyle}
            labelStyle={tooltipLabelStyle}
            itemStyle={tooltipItemStyle}
          />
          <Bar dataKey="completed" stackId="a" fill="hsl(var(--chart-1))" name="Completed" />
          <Bar dataKey="failed" stackId="a" fill="hsl(var(--chart-5))" name="Failed" />
          <Bar dataKey="other" stackId="a" fill="hsl(var(--chart-3))" name="Other" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
})
