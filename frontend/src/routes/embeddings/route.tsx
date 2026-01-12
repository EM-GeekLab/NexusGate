import { createFileRoute, Outlet } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import {
  AppHeader,
  AppHeaderPart,
  AppHeaderTitle,
  AppSidebarSeparator,
  AppSidebarTrigger,
} from '@/components/app/app-header'

export const Route = createFileRoute('/embeddings')({
  component: RouteComponent,
})

function RouteComponent() {
  const { t } = useTranslation()
  return (
    <>
      <AppHeader className="border-b">
        <AppHeaderPart>
          <AppSidebarTrigger />
          <AppSidebarSeparator />
          <AppHeaderTitle>{t('routes.embeddings.route.Embeddings')}</AppHeaderTitle>
        </AppHeaderPart>
      </AppHeader>
      <Outlet />
    </>
  )
}
