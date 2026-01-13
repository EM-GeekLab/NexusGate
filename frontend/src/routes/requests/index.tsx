import { queryOptions, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'
import { z } from 'zod'

import { api } from '@/lib/api'
import { formatError } from '@/lib/error'
import { removeUndefinedFields } from '@/lib/utils'
import { AppErrorComponent } from '@/components/app/app-error'
import { queryClient } from '@/components/app/query-provider'
import i18n from '@/i18n'
import type { ChatRequest } from '@/pages/requests/columns'
import { RequestsDataTable } from '@/pages/requests/data-table'

const requestsSearchSchema = z.object({
  page: z.number().catch(1),
  pageSize: z.number().catch(20),
  apiKeyId: z.number().optional(),
  upstreamId: z.number().optional(),
  model: z.string().optional(),
  selectedRequestId: z.number().optional(),
})

type RequestsSearchSchema = z.infer<typeof requestsSearchSchema>

const requestsQueryOptions = ({ page, pageSize, apiKeyId, upstreamId, model }: RequestsSearchSchema) =>
  queryOptions({
    queryKey: ['requests', { page, pageSize, apiKeyId, upstreamId, model }],
    queryFn: async () => {
      const { data: rawData, error } = await api.admin.completions.get({
        query: {
          offset: (page - 1) * pageSize,
          limit: pageSize,
          ...removeUndefinedFields({ apiKeyId, upstreamId, model }),
        },
      })
      if (error) throw formatError(error, i18n.t('routes.requests.index.FetchError'))
      const { data, total } = rawData
      return { data: data as ChatRequest[], total }
    },
  })

export const Route = createFileRoute('/requests/')({
  validateSearch: zodValidator(requestsSearchSchema),
  loaderDeps: ({ search: { page, pageSize, apiKeyId, upstreamId, model } }) => ({ page, pageSize, apiKeyId, upstreamId, model }),
  loader: ({ deps }) => queryClient.ensureQueryData(requestsQueryOptions(deps)),
  component: RouteComponent,
  errorComponent: AppErrorComponent,
})

function RouteComponent() {
  const { page, pageSize, apiKeyId, upstreamId, model } = Route.useSearch()
  const {
    data: { data, total },
  } = useSuspenseQuery(requestsQueryOptions({ page, pageSize, apiKeyId, upstreamId, model }))

  return (
    <main className="flex h-[calc(100svh-3rem)] items-stretch">
      <RequestsDataTable data={data} total={total} />
    </main>
  )
}
