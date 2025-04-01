import { queryOptions, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'
import { z } from 'zod'

import { api } from '@/lib/api'
import { formatError } from '@/lib/error'
import { AppErrorComponent } from '@/components/app/app-error'
import { queryClient } from '@/components/app/query-provider'
import { ApiKeysDataTable } from '@/pages/api-keys/data-table'

import i18n from '@/i18n'
const apiKeysQueryOptions = ({ includeRevoked = false }: { includeRevoked?: boolean }) =>
  queryOptions({
    queryKey: ['apiKeys', { includeRevoked }],
    queryFn: async () => {
      const { data, error } = await api.admin.apiKey.get({ query: { includeRevoked } })
      if (error) throw formatError(error,i18n.t('An error occurred while fetching applications.'))
      return data
    },
  })

const apiKeysSearchSchema = z.object({
  includeRevoked: z.boolean().optional(),
})

export const Route = createFileRoute('/apps/')({
  validateSearch: zodValidator(apiKeysSearchSchema),
  loaderDeps: ({ search: { includeRevoked } }) => ({ includeRevoked }),
  loader: ({ deps: { includeRevoked } }) => queryClient.ensureQueryData(apiKeysQueryOptions({ includeRevoked })),
  component: RouteComponent,
  errorComponent: AppErrorComponent,
})

function RouteComponent() {
  const { includeRevoked = false } = Route.useSearch()
  const { data } = useSuspenseQuery(apiKeysQueryOptions({ includeRevoked }))

  return (
    <main className="px-4">
      <div className="mx-auto max-w-6xl">
        <ApiKeysDataTable data={data} includeRevoked={includeRevoked} />
      </div>
    </main>
  )
}
