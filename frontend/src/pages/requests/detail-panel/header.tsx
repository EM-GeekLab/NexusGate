import type { ComponentProps } from 'react'
import { format } from 'date-fns'
import { ArrowLeftIcon, BracesIcon, PanelRightIcon, Rows2Icon } from 'lucide-react'
import { match } from 'ts-pattern'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { IndicatorBadge } from '@/components/ui/indicator-badge'
import { Separator } from '@/components/ui/separator'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'

import type { ChatRequest } from '../columns'
import { useRequestDetail } from '../request-detail-provider'
import { useRequestDetailContext } from './index'

import { useTranslation } from 'react-i18next'

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
            {t('Pretty')}
          </TabsTrigger>
          <TabsTrigger value="raw">
            <BracesIcon />
            {t('Raw')}
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
      <IndicatorBadge className="bg-neutral-500/15 text-neutral-800 dark:text-neutral-200">{t('Pending')}</IndicatorBadge>
    ))
    .with('completed', () => (
      <IndicatorBadge className="bg-green-500/15 text-green-800 dark:text-green-200">{t('Completed')}</IndicatorBadge>
    ))
    .with('failed', () => (
      <IndicatorBadge className="bg-red-500/15 text-red-800 dark:text-red-200">{t('Failed')}</IndicatorBadge>
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
      <span className="sr-only">{t('Close panel')}</span>
    </Button>
  )
}
