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
import type { EmbeddingRequest } from '@/pages/embeddings/columns'
import { EmbeddingsDataTable } from '@/pages/embeddings/data-table'

const embeddingsSearchSchema = z.object({
  page: z.number().catch(1),
  pageSize: z.number().catch(20),
  apiKeyId: z.number().optional(),
  modelId: z.number().optional(),
  selectedEmbeddingId: z.number().optional(),
})

type EmbeddingsSearchSchema = z.infer<typeof embeddingsSearchSchema>

const embeddingsQueryOptions = ({ page, pageSize, apiKeyId, modelId }: EmbeddingsSearchSchema) =>
  queryOptions({
    queryKey: ['embeddings', { page, pageSize, apiKeyId, modelId }],
    queryFn: async () => {
      const { data: rawData, error } = await api.admin.embeddings.get({
        query: {
          offset: (page - 1) * pageSize,
          limit: pageSize,
          ...removeUndefinedFields({ apiKeyId, modelId }),
        },
      })
      if (error) throw formatError(error, i18n.t('routes.embeddings.index.FetchError'))
      const { data, total } = rawData
      return { data: data as EmbeddingRequest[], total }
    },
  })

export const Route = createFileRoute('/embeddings/')({
  validateSearch: zodValidator(embeddingsSearchSchema),
  loaderDeps: ({ search: { page, pageSize, apiKeyId, modelId } }) => ({ page, pageSize, apiKeyId, modelId }),
  loader: ({ deps }) => queryClient.ensureQueryData(embeddingsQueryOptions(deps)),
  component: RouteComponent,
  errorComponent: AppErrorComponent,
})

function RouteComponent() {
  const { page, pageSize, apiKeyId, modelId } = Route.useSearch()
  const {
    data: { data, total },
  } = useSuspenseQuery(embeddingsQueryOptions({ page, pageSize, apiKeyId, modelId }))

  return (
    <main className="flex h-[calc(100svh-3rem)] items-stretch">
      <EmbeddingsDataTable data={data} total={total} />
    </main>
  )
}
