import { createFileRoute, redirect } from '@tanstack/react-router'

import { AppErrorComponent } from '@/components/app/app-error'

import { useTranslation } from 'react-i18next'

export const Route = createFileRoute('/_dashboard/')({
  component: RouteComponent,
  errorComponent: AppErrorComponent,
  beforeLoad: () => redirect({ to: '/requests' }),
})

function RouteComponent() {
  const { t } = useTranslation()
  return <div>{t('Src_routes_dashboard_index_Welcome')}</div>
}
