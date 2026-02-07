import { createFileRoute } from '@tanstack/react-router'

import { ComparePage } from '@/pages/playground/compare/compare-page'

export const Route = createFileRoute('/playground/compare/')({
  component: ComparePage,
})
