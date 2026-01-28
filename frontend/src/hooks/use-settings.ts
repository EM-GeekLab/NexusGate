import { queryOptions, useQuery } from '@tanstack/react-query'

import { api } from '@/lib/api'

export interface GrafanaDashboard {
  id: string
  label: string
  url: string
}

export interface DashboardsResponse {
  dashboards: GrafanaDashboard[]
  envOverride: boolean
}

const dashboardsQueryOptions = queryOptions({
  queryKey: ['dashboards'],
  queryFn: async (): Promise<DashboardsResponse> => {
    const { data, error } = await api.admin.dashboards.get()
    if (error) {
      return { dashboards: [], envOverride: false }
    }
    // Runtime validation to handle unexpected API responses
    const response = data as DashboardsResponse
    if (!Array.isArray(response?.dashboards)) {
      return { dashboards: [], envOverride: false }
    }
    return response
  },
  staleTime: 5 * 60 * 1000, // 5 minutes
  retry: false,
})

export function useGrafanaDashboards() {
  return useQuery(dashboardsQueryOptions)
}

// Backward compatibility - returns first dashboard URL if available
export function useGrafanaDashboardUrl() {
  const { data } = useGrafanaDashboards()
  return data?.dashboards?.[0]?.url
}
