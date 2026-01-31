import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import {
  AppHeader,
  AppHeaderPart,
  AppHeaderSpacer,
  AppHeaderTitle,
  AppSidebarSeparator,
  AppSidebarTrigger,
} from '@/components/app/app-header'
import { useIsMobile } from '@/hooks/use-mobile'
import { TimeRangeSelect } from '@/pages/overview/time-range-select'
import type { TimeRange } from '@/pages/overview/use-overview-stats'

import { Route as DashboardIndexRoute } from './index'

export const Route = createFileRoute('/_dashboard')({
  component: RouteComponent,
})

function RouteComponent() {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const { range } = DashboardIndexRoute.useSearch()
  const navigate = useNavigate()

  const timeRange = range as TimeRange

  const handleTimeRangeChange = (value: TimeRange) => {
    navigate({
      to: '/',
      search: { range: value },
      replace: true,
    })
  }

  return (
    <div className="flex h-svh flex-col">
      <AppHeader className="border-b">
        <AppHeaderPart>
          <AppSidebarTrigger />
          <AppSidebarSeparator />
          <AppHeaderTitle>{t('routes.dashboard.route.Overview')}</AppHeaderTitle>
        </AppHeaderPart>
        {!isMobile && (
          <>
            <AppHeaderSpacer />
            <AppHeaderPart>
              <TimeRangeSelect value={timeRange} onChange={handleTimeRangeChange} />
            </AppHeaderPart>
          </>
        )}
      </AppHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  )
}
