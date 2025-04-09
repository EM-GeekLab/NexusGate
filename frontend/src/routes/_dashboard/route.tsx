import { createFileRoute, Outlet } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import {
  AppHeader,
  AppHeaderPart,
  AppHeaderTitle,
  AppSidebarSeparator,
  AppSidebarTrigger,
} from '@/components/app/app-header'

export const Route = createFileRoute('/_dashboard')({
  component: RouteComponent,
})

function RouteComponent() {
  const { t } = useTranslation()

  return (
    <>
      <AppHeader>
        <AppHeaderPart>
          <AppSidebarTrigger />
          <AppSidebarSeparator />
          <AppHeaderTitle>{t('Src_routes_dashboard_route_Overview')}</AppHeaderTitle>
        </AppHeaderPart>
      </AppHeader>
      <Outlet />
    </>
  )
}
