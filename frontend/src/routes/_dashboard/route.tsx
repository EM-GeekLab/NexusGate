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
import { useGrafanaDashboardUrl } from '@/hooks/use-settings'
import { TimeRangeSelect } from '@/pages/overview/time-range-select'
import type { TimeRange } from '@/pages/overview/use-overview-stats'
import { ViewModeToggle, type ViewMode } from '@/pages/overview/view-mode-toggle'

import { Route as DashboardIndexRoute } from './index'

export const Route = createFileRoute('/_dashboard')({
  component: RouteComponent,
})

function RouteComponent() {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const { range, view } = DashboardIndexRoute.useSearch()
  const navigate = useNavigate()
  const grafanaUrl = useGrafanaDashboardUrl()

  const timeRange = range as TimeRange
  const viewMode = view as ViewMode

  const handleTimeRangeChange = (value: TimeRange) => {
    navigate({
      to: '/',
      search: (prev) => ({ ...prev, range: value }),
      replace: true,
    })
  }

  const handleViewModeChange = (value: ViewMode) => {
    navigate({
      to: '/',
      search: (prev) => ({ ...prev, view: value }),
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
            <AppHeaderPart className="gap-2">
              {grafanaUrl && <ViewModeToggle value={viewMode} onChange={handleViewModeChange} />}
              {viewMode !== 'grafana' && <TimeRangeSelect value={timeRange} onChange={handleTimeRangeChange} />}
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
