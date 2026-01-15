import { queryOptions, useQuery } from '@tanstack/react-query'

import { api } from '@/lib/api'
import { formatError } from '@/lib/error'

export type TimeRange = '1m' | '5m' | '10m' | '30m' | '1h' | '4h' | '12h'

export const overviewQueryOptions = (range: TimeRange) =>
  queryOptions({
    queryKey: ['overview', range],
    queryFn: async () => {
      const { data, error } = await api.admin.stats.overview.get({
        query: { range },
      })
      if (error) throw formatError(error, 'Failed to fetch overview stats')
      return data
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  })

export function useOverviewStats(range: TimeRange) {
  return useQuery(overviewQueryOptions(range))
}

export type OverviewStats = NonNullable<ReturnType<typeof useOverviewStats>['data']>
