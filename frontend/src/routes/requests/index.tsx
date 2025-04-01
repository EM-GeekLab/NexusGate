import { queryOptions, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'
import { z } from 'zod'

import { api } from '@/lib/api'
import { formatError } from '@/lib/error'
import { removeUndefinedFields } from '@/lib/utils'
import { AppErrorComponent } from '@/components/app/app-error'
import { queryClient } from '@/components/app/query-provider'
import type { ChatRequest } from '@/pages/requests/columns'
import { RequestsDataTable } from '@/pages/requests/data-table'

import i18n from '@/i18n'

const requestsSearchSchema = z.object({
  page: z.number().catch(1),
  pageSize: z.number().catch(20),
  apiKeyId: z.number().optional(),
  upstreamId: z.number().optional(),
  selectedRequestId: z.number().optional(),
})

type RequestsSearchSchema = z.infer<typeof requestsSearchSchema>

const requestsQueryOptions = ({ page, pageSize, apiKeyId, upstreamId }: RequestsSearchSchema) =>
  queryOptions({
    queryKey: ['requests', { page, pageSize, apiKeyId, upstreamId }],
    queryFn: async () => {
      const { data: rawData, error } = await api.admin.completions.get({
        query: {
          offset: (page - 1) * pageSize,
          limit: pageSize,
          ...removeUndefinedFields({ apiKeyId, upstreamId }),
        },
      })
      if (error) throw formatError(error, i18n.t('An error occurred while fetching requests.'))
      const { data, total } = rawData
      return { data: data as ChatRequest[], total }
    },
  })

export const Route = createFileRoute('/requests/')({
  validateSearch: zodValidator(requestsSearchSchema),
  loaderDeps: ({ search: { page, pageSize, apiKeyId, upstreamId } }) => ({ page, pageSize, apiKeyId, upstreamId }),
  loader: ({ deps }) => queryClient.ensureQueryData(requestsQueryOptions(deps)),
  component: RouteComponent,
  errorComponent: AppErrorComponent,
})

function RouteComponent() {
  const { page, pageSize, apiKeyId, upstreamId } = Route.useSearch()
  const {
    data: { data, total },
  } = useSuspenseQuery(requestsQueryOptions({ page, pageSize, apiKeyId, upstreamId }))

  return (
    <main className="flex h-[calc(100svh-3rem)] items-stretch">
      <RequestsDataTable data={data} total={total} />
    </main>
  )
}
