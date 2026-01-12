import { queryOptions, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

import { api } from '@/lib/api'
import { formatError } from '@/lib/error'
import { AppErrorComponent } from '@/components/app/app-error'
import { queryClient } from '@/components/app/query-provider'
import i18n from '@/i18n'
import { ProvidersDataTable } from '@/pages/settings/providers-data-table'

const providersQueryOptions = () =>
  queryOptions({
    queryKey: ['providers'],
    queryFn: async () => {
      const { data, error } = await api.admin.providers.get()
      if (error) throw formatError(error, i18n.t('routes.providers.index.FetchError'))
      return data
    },
  })

export const Route = createFileRoute('/providers/')({
  loader: () => queryClient.ensureQueryData(providersQueryOptions()),
  component: RouteComponent,
  errorComponent: AppErrorComponent,
})

function RouteComponent() {
  const { data } = useSuspenseQuery(providersQueryOptions())

  return (
    <main className="px-4">
      <div className="mx-auto max-w-7xl">
        <ProvidersDataTable data={data} />
      </div>
    </main>
  )
}
