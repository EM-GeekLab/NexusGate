import { queryOptions, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

import { api } from '@/lib/api'
import { formatError } from '@/lib/error'
import { AppErrorComponent } from '@/components/app/app-error'
import { queryClient } from '@/components/app/query-provider'
import i18n from '@/i18n'
import { GrafanaSettingsPage } from '@/pages/settings/grafana-settings-page'
import type { GrafanaConnectionResponse, DashboardsResponse } from '@/hooks/use-settings'

const grafanaConnectionQueryOptions = () =>
  queryOptions({
    queryKey: ['grafanaConnection'],
    queryFn: async () => {
      const { data, error } = await api.admin.grafana.connection.get()
      if (error) throw formatError(error, i18n.t('pages.settings.grafana.FetchError'))
      return data as GrafanaConnectionResponse
    },
  })

const dashboardsQueryOptions = () =>
  queryOptions({
    queryKey: ['dashboards'],
    queryFn: async () => {
      const { data, error } = await api.admin.dashboards.get()
      if (error) throw formatError(error, i18n.t('pages.settings.grafana.FetchError'))
      return data as DashboardsResponse
    },
  })

export const Route = createFileRoute('/settings/grafana')({
  loader: async () => {
    await Promise.all([
      queryClient.ensureQueryData(grafanaConnectionQueryOptions()),
      queryClient.ensureQueryData(dashboardsQueryOptions()),
    ])
  },
  component: RouteComponent,
  errorComponent: AppErrorComponent,
})

function RouteComponent() {
  const { data: connection } = useSuspenseQuery(grafanaConnectionQueryOptions())
  const { data: dashboardsData } = useSuspenseQuery(dashboardsQueryOptions())

  return (
    <GrafanaSettingsPage
      connection={connection}
      dashboards={dashboardsData.dashboards}
      envOverride={dashboardsData.envOverride}
    />
  )
}
