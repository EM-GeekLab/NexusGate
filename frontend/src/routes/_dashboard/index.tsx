import { createFileRoute } from '@tanstack/react-router'

import { AppErrorComponent } from '@/components/app/app-error'
import { OverviewPage } from '@/pages/overview'

export const Route = createFileRoute('/_dashboard/')({
  component: OverviewPage,
  errorComponent: AppErrorComponent,
})
