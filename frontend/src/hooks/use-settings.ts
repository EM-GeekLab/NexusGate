import { queryOptions, useQuery } from '@tanstack/react-query'

import { api } from '@/lib/api'

const GRAFANA_DASHBOARD_URL_KEY = 'grafana_dashboard_url'

const grafanaDashboardUrlQueryOptions = queryOptions({
  queryKey: ['settings', GRAFANA_DASHBOARD_URL_KEY],
  queryFn: async () => {
    const { data, error } = await api.admin.settings[GRAFANA_DASHBOARD_URL_KEY].get()
    if (error) return null
    return (data as { value: unknown } | null)?.value as string | undefined
  },
  staleTime: 5 * 60 * 1000, // 5 minutes
  retry: false,
})

export function useGrafanaDashboardUrl() {
  const { data } = useQuery(grafanaDashboardUrlQueryOptions)
  return data ?? undefined
}
