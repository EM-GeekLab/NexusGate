import { queryOptions, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

// import { useTranslation } from 'react-i18next'

import { api } from '@/lib/api'
import { formatError } from '@/lib/error'
import { AppErrorComponent } from '@/components/app/app-error'
import { queryClient } from '@/components/app/query-provider'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import i18n from '@/i18n'

const dashboardsQueryOptions = queryOptions({
  queryKey: ['dashboards'],
  queryFn: async () => {
    const { data, error } = await api.admin.dashboards.get()
    if (error) throw formatError(error, i18n.t('routes.dashboard.FetchError'))
    return data
  },
})

export const Route = createFileRoute('/_dashboard/')({
  component: RouteComponent,
  errorComponent: AppErrorComponent,
  loader: () => queryClient.ensureQueryData(dashboardsQueryOptions),
})

function RouteComponent() {
  // const { t } = useTranslation()
  const { data: dashboards } = useSuspenseQuery(dashboardsQueryOptions)

  return (
    <main className="flex-grow px-4 pb-4">
      <Tabs defaultValue={dashboards[0]?.name} className="h-full">
        <TabsList>
          {dashboards.map(({ name }) => (
            <TabsTrigger value={name}>{name}</TabsTrigger>
          ))}
        </TabsList>
        {dashboards.map(({ name, url }) => (
          <TabsContent value={name} forceMount className="size-full data-[state=inactive]:hidden">
            <iframe src={url} className="size-full rounded-lg" />
          </TabsContent>
        ))}
      </Tabs>
    </main>
  )
}
