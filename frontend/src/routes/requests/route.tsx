import { createFileRoute, Outlet } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import {
  AppHeader,
  AppHeaderPart,
  AppHeaderTitle,
  AppSidebarSeparator,
  AppSidebarTrigger,
} from '@/components/app/app-header'
import { FilterResetButton } from '@/pages/requests/filter-reset-button'
import { RequestsRefreshButton } from '@/pages/requests/refresh-button'

export const Route = createFileRoute('/requests')({
  component: RouteComponent,
})

function RouteComponent() {
  const { t } = useTranslation()
  return (
    <div className="flex h-svh flex-col">
      <AppHeader className="border-b">
        <AppHeaderPart>
          <AppSidebarTrigger />
          <AppSidebarSeparator />
          <AppHeaderTitle>{t('routes.requests.route.Requests')}</AppHeaderTitle>
          <RequestsRefreshButton />
          <FilterResetButton />
        </AppHeaderPart>
      </AppHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  )
}
