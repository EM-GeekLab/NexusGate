import { memo } from 'react'
import { ActivityIcon, ClockIcon, GaugeIcon, ZapIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

import type { OverviewStats } from './use-overview-stats'

interface SummaryCardsProps {
  data: OverviewStats
}

export const SummaryCards = memo(function SummaryCards({ data }: SummaryCardsProps) {
  const { t } = useTranslation()

  const { summary } = data

  // Calculate overall success rate
  const totalCompleted =
    (summary.completionsCount * summary.completionsSuccessRate) / 100 +
    (summary.embeddingsCount * summary.embeddingsSuccessRate) / 100
  const overallSuccessRate =
    summary.totalRequests > 0 ? (totalCompleted / summary.totalRequests) * 100 : 100

  const cards = [
    {
      title: t('pages.overview.metrics.totalRequests'),
      value: summary.totalRequests.toLocaleString(),
      description: `${summary.completionsCount} ${t('pages.overview.metrics.completions')} / ${summary.embeddingsCount} ${t('pages.overview.metrics.embeddings')}`,
      icon: <ActivityIcon className="size-4 text-muted-foreground" />,
    },
    {
      title: t('pages.overview.metrics.avgLatency'),
      value: summary.avgDuration > 0 ? `${summary.avgDuration}ms` : '-',
      description: t('pages.overview.metrics.avgLatencyDesc'),
      icon: <ClockIcon className="size-4 text-muted-foreground" />,
    },
    {
      title: t('pages.overview.metrics.avgTTFT'),
      value: summary.avgTTFT > 0 ? `${summary.avgTTFT}ms` : '-',
      description: t('pages.overview.metrics.avgTTFTDesc'),
      icon: <ZapIcon className="size-4 text-muted-foreground" />,
    },
    {
      title: t('pages.overview.metrics.successRate'),
      value: `${overallSuccessRate.toFixed(1)}%`,
      description: `${t('pages.overview.metrics.completions')}: ${summary.completionsSuccessRate.toFixed(1)}% / ${t('pages.overview.metrics.embeddings')}: ${summary.embeddingsSuccessRate.toFixed(1)}%`,
      icon: <GaugeIcon className="size-4 text-muted-foreground" />,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
            {card.icon}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{card.value}</div>
            <p className="text-xs text-muted-foreground">{card.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
})
