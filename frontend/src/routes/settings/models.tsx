import { queryOptions, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

import { api } from '@/lib/api'
import { formatError } from '@/lib/error'
import { AppErrorComponent } from '@/components/app/app-error'
import { queryClient } from '@/components/app/query-provider'
import i18n from '@/i18n'
import { ModelsSettingsPage } from '@/pages/settings/models-settings-page'

const systemNamesQueryOptions = () =>
  queryOptions({
    queryKey: ['models', 'system-names'],
    queryFn: async () => {
      const { data, error } = await api.admin.models['system-names'].get()
      if (error) throw formatError(error, i18n.t('routes.models.index.FetchError'))
      return data
    },
  })

export const Route = createFileRoute('/settings/models')({
  loader: () => queryClient.ensureQueryData(systemNamesQueryOptions()),
  component: RouteComponent,
  errorComponent: AppErrorComponent,
})

function RouteComponent() {
  const { data } = useSuspenseQuery(systemNamesQueryOptions())

  return <ModelsSettingsPage systemNames={data} />
}
