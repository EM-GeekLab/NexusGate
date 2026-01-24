import type { ComponentProps } from 'react'
import { format } from 'date-fns'
import { ArrowLeftIcon, BracesIcon, PanelRightIcon, Rows2Icon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { match } from 'ts-pattern'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { IndicatorBadge } from '@/components/ui/indicator-badge'
import { Separator } from '@/components/ui/separator'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'

import type { ChatRequest } from '../columns'
import { useRequestDetail } from '../request-detail-provider'
import { useRequestDetailContext } from './index'

export function DetailPanelHeader() {
  const { t } = useTranslation()

  const data = useRequestDetailContext()

  return (
    <header className="flex items-center justify-between p-4 @2xl:border-b">
      <div className="flex items-center gap-2">
        <DetailPanelCloseButton className="-m-1.5 mr-0" />
        <Separator orientation="vertical" className="mr-2 !h-4" />
        <StatusIndicator status={data.status} />
        <h2 className="text-sm font-medium">{format(data.createdAt, 'PP HH:mm:ss')}</h2>
      </div>
      <div className="-my-1.5 flex items-center gap-2">
        <TabsList className="h-8 p-0.5">
          <TabsTrigger value="pretty">
            <Rows2Icon />
            {t('pages.requests.detail-panel.header.Pretty')}
          </TabsTrigger>
          <TabsTrigger value="raw">
            <BracesIcon />
            {t('pages.requests.detail-panel.header.Raw')}
          </TabsTrigger>
        </TabsList>
      </div>
    </header>
  )
}

function StatusIndicator({ status }: { status: ChatRequest['status'] }) {
  const { t } = useTranslation()

  return match(status)
    .with('pending', () => (
      <IndicatorBadge className="bg-neutral-500/15 text-neutral-800 dark:text-neutral-200">
        {t('pages.requests.detail-panel.header.Pending')}
      </IndicatorBadge>
    ))
    .with('completed', () => (
      <IndicatorBadge className="bg-green-500/15 text-green-800 dark:text-green-200">
        {t('pages.requests.detail-panel.header.Completed')}
      </IndicatorBadge>
    ))
    .with('failed', () => (
      <IndicatorBadge className="bg-red-500/15 text-red-800 dark:text-red-200">
        {t('pages.requests.detail-panel.header.Failed')}
      </IndicatorBadge>
    ))
    .with('aborted', () => (
      <IndicatorBadge className="bg-amber-500/15 text-amber-800 dark:text-amber-200">
        {t('pages.requests.detail-panel.header.Aborted')}
      </IndicatorBadge>
    ))
    .exhaustive()
}

export function DetailPanelCloseButton({ className, ...props }: ComponentProps<typeof Button>) {
  const { t } = useTranslation()

  const { setSelectedRequestId } = useRequestDetail()

  return (
    <Button
      variant="ghost"
      className={cn('size-8 p-0', className)}
      onClick={() => setSelectedRequestId(undefined)}
      {...props}
    >
      <ArrowLeftIcon className="lg:hidden" />
      <PanelRightIcon className="max-lg:hidden" />
      <span className="sr-only">{t('pages.requests.detail-panel.header.ClosePanel')}</span>
    </Button>
  )
}
