import { queryOptions, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

import { api } from '@/lib/api'
import { formatError } from '@/lib/error'
import { AppErrorComponent } from '@/components/app/app-error'
import { queryClient } from '@/components/app/query-provider'
import i18n from '@/i18n'
import { grafanaConnectionQueryOptions, type GrafanaConnectionResponse } from '@/hooks/use-settings'
import { AlertsSettingsPage } from '@/pages/settings/alerts-settings-page'

const alertChannelsQueryOptions = () =>
  queryOptions({
    queryKey: ['alertChannels'],
    queryFn: async () => {
      const { data, error } = await api.admin.alerts.channels.get()
      if (error) throw formatError(error, i18n.t('pages.settings.alerts.FetchChannelsError'))
      return data
    },
  })

const alertRulesQueryOptions = () =>
  queryOptions({
    queryKey: ['alertRules'],
    queryFn: async () => {
      const { data, error } = await api.admin.alerts.rules.get()
      if (error) throw formatError(error, i18n.t('pages.settings.alerts.FetchRulesError'))
      return data
    },
  })

const alertHistoryQueryOptions = () =>
  queryOptions({
    queryKey: ['alertHistory'],
    queryFn: async () => {
      const { data, error } = await api.admin.alerts.history.get({ query: { limit: 50 } })
      if (error) throw formatError(error, i18n.t('pages.settings.alerts.FetchHistoryError'))
      return data
    },
  })

export const Route = createFileRoute('/settings/alerts')({
  loader: async () => {
    await Promise.all([
      queryClient.ensureQueryData(alertChannelsQueryOptions()),
      queryClient.ensureQueryData(alertRulesQueryOptions()),
      queryClient.ensureQueryData(alertHistoryQueryOptions()),
      queryClient.ensureQueryData(grafanaConnectionQueryOptions),
    ])
  },
  component: RouteComponent,
  errorComponent: AppErrorComponent,
})

function RouteComponent() {
  const { data: channels } = useSuspenseQuery(alertChannelsQueryOptions())
  const { data: rules } = useSuspenseQuery(alertRulesQueryOptions())
  const { data: history } = useSuspenseQuery(alertHistoryQueryOptions())
  const { data: grafanaConnection } = useSuspenseQuery(grafanaConnectionQueryOptions)

  const grafanaConnected = (grafanaConnection as GrafanaConnectionResponse | undefined)?.verified ?? false
  const grafanaApiUrl = (grafanaConnection as GrafanaConnectionResponse | undefined)?.apiUrl ?? null

  /* eslint-disable @typescript-eslint/no-explicit-any */
  return (
    <AlertsSettingsPage
      channels={channels as any[]}
      rules={rules as any[]}
      history={history as any}
      grafanaConnected={grafanaConnected}
      grafanaApiUrl={grafanaApiUrl}
    />
  )
  /* eslint-enable @typescript-eslint/no-explicit-any */
}
