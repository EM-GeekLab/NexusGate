import { queryOptions, useQuery, useSuspenseQuery } from '@tanstack/react-query'
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
import { SearchBar } from '@/pages/requests/search-bar'
import { AggregationResults } from '@/pages/search/aggregation-results'

const requestsSearchSchema = z.object({
  page: z.number().catch(1),
  pageSize: z.number().catch(20),
  apiKeyId: z.number().optional(),
  upstreamId: z.number().optional(),
  model: z.string().optional(),
  selectedRequestId: z.number().optional(),
  q: z.string().optional(),
  range: z.enum(['15m', '1h', '4h', '12h', '24h', '7d', '30d']).catch('24h'),
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
  loaderDeps: ({ search: { page, pageSize, apiKeyId, upstreamId, model, q } }) => ({
    page,
    pageSize,
    apiKeyId,
    upstreamId,
    model,
    q,
  }),
  loader: ({ deps }) => {
    // Only use the standard loader when there's no search query
    if (!deps.q) {
      return queryClient.ensureQueryData(requestsQueryOptions(deps as RequestsSearchSchema))
    }
    return null
  },
  component: RouteComponent,
  errorComponent: AppErrorComponent,
})

function RouteComponent() {
  const { q } = Route.useSearch()

  // When there's a KQL search query, use the search endpoint
  const isSearching = !!q?.trim()

  return (
    <main className="flex h-[calc(100svh-3rem)] flex-col">
      <SearchBar />
      {isSearching ? (
        <SearchResults />
      ) : (
        <DefaultResults />
      )}
    </main>
  )
}

function DefaultResults() {
  const { page, pageSize, apiKeyId, upstreamId, model } = Route.useSearch()
  const {
    data: { data, total },
  } = useSuspenseQuery(requestsQueryOptions({ page, pageSize, apiKeyId, upstreamId, model } as RequestsSearchSchema))

  return (
    <div className="flex min-h-0 flex-1 items-stretch">
      <RequestsDataTable data={data} total={total} />
    </div>
  )
}

function SearchResults() {
  const { q, range, page, pageSize } = Route.useSearch()

  const now = new Date()
  const rangeMs: Record<string, number> = {
    '15m': 15 * 60_000,
    '1h': 3600_000,
    '4h': 4 * 3600_000,
    '12h': 12 * 3600_000,
    '24h': 24 * 3600_000,
    '7d': 7 * 86400_000,
    '30d': 30 * 86400_000,
  }
  const from = new Date(now.getTime() - (rangeMs[range ?? '24h'] ?? 86400_000)).toISOString()
  const to = now.toISOString()

  const { data, isLoading, error } = useQuery({
    queryKey: ['search', { q, range, page, pageSize }],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: result, error: err } = await (api.admin.search as any).post({
        query: q ?? '',
        timeRange: { from, to },
        offset: (page - 1) * pageSize,
        limit: pageSize,
      })
      if (err) throw new Error('Search failed')
      return result
    },
    enabled: !!q?.trim(),
  })

  if (isLoading) {
    return (
      <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">Searching...</div>
    )
  }

  if (error) {
    return (
      <div className="text-destructive flex flex-1 items-center justify-center text-sm">
        Search error: {error.message}
      </div>
    )
  }

  if (!data) return null

  // Aggregation results
  if (data.type === 'aggregation') {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <AggregationResults results={(data as { type: string; results: Record<string, unknown>[] }).results} />
      </div>
    )
  }

  // Document results — normalize snake_case raw SQL rows to ChatRequest format
  const rawRows = (data as { data: Record<string, unknown>[]; total: number })
  const normalized = rawRows.data.map((row: Record<string, unknown>) => ({
    id: row.id,
    apiKeyId: row.api_key_id,
    upstreamId: null,
    modelId: null,
    model: row.model,
    status: row.status,
    duration: row.duration,
    ttft: row.ttft,
    promptTokens: row.prompt_tokens,
    completionTokens: row.completion_tokens,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deleted: false,
    rating: row.rating ?? null,
    reqId: row.req_id ?? null,
    sourceCompletionId: null,
    apiFormat: row.api_format ?? null,
    cachedResponse: null,
    prompt: typeof row.prompt === 'string' ? JSON.parse(row.prompt) : row.prompt,
    completion: typeof row.completion === 'string' ? JSON.parse(row.completion) : row.completion,
    providerName: row.provider_name ?? null,
  })) as unknown as ChatRequest[]

  return (
    <div className="flex min-h-0 flex-1 items-stretch">
      <RequestsDataTable data={normalized} total={rawRows.total} />
    </div>
  )
}
