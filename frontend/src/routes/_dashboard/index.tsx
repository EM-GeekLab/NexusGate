import { createFileRoute } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'
import { z } from 'zod'

import { AppErrorComponent } from '@/components/app/app-error'
import { OverviewPage } from '@/pages/overview'

export const overviewSearchSchema = z.object({
  range: z.enum(['1m', '5m', '10m', '30m', '1h', '4h', '12h']).catch('1h'),
})

export type OverviewSearchSchema = z.infer<typeof overviewSearchSchema>

export const Route = createFileRoute('/_dashboard/')({
  component: OverviewPage,
  errorComponent: AppErrorComponent,
  validateSearch: zodValidator(overviewSearchSchema),
})
