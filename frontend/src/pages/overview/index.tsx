import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

import { LatencyChart } from './charts/latency-chart'
import { ModelDistributionChart } from './charts/model-distribution'
import { RequestsTrendChart } from './charts/requests-trend-chart'
import { SuccessRateChart } from './charts/success-rate-chart'
import { TokenUsageChart } from './charts/token-usage-chart'
import { SummaryCards } from './summary-cards'
import { TimeRangeSelect } from './time-range-select'
import { useOverviewStats, type TimeRange } from './use-overview-stats'

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
              <Skeleton className="mt-2 h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[300px] w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-24" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[300px] w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export function OverviewPage() {
  const { t } = useTranslation()
  const [timeRange, setTimeRange] = useState<TimeRange>('1h')
  const { data, isLoading, error } = useOverviewStats(timeRange)

  if (error) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <p className="text-destructive">{t('pages.overview.fetchError')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      {/* Time range selector */}
      <div className="flex items-center justify-end">
        <TimeRangeSelect value={timeRange} onChange={setTimeRange} />
      </div>

      {isLoading || !data ? (
        <LoadingSkeleton />
      ) : (
        <>
          {/* Summary Cards */}
          <SummaryCards data={data} />

          {/* Row 2: Request Trend + Token Usage */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>{t('pages.overview.charts.requestsTrend')}</CardTitle>
              </CardHeader>
              <CardContent>
                <RequestsTrendChart data={data.timeSeries} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t('pages.overview.charts.tokenUsage')}</CardTitle>
              </CardHeader>
              <CardContent>
                <TokenUsageChart data={data.tokenUsage} />
              </CardContent>
            </Card>
          </div>

          {/* Row 3: Latency Trend + Model Distribution */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t('pages.overview.charts.latencyTrend')}</CardTitle>
              </CardHeader>
              <CardContent>
                <LatencyChart data={data.timeSeries} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t('pages.overview.charts.modelDistribution')}</CardTitle>
              </CardHeader>
              <CardContent>
                <ModelDistributionChart data={data.modelDistribution} />
              </CardContent>
            </Card>
          </div>

          {/* Row 4: Success Rate Trend */}
          <Card>
            <CardHeader>
              <CardTitle>{t('pages.overview.charts.successRateTrend')}</CardTitle>
            </CardHeader>
            <CardContent>
              <SuccessRateChart data={data.timeSeries} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
