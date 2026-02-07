import { createFileRoute } from '@tanstack/react-router'

import { TestCaseDetailPage } from '@/pages/playground/compare/test-case-detail-page'

export const Route = createFileRoute('/playground/compare/$testCaseId')({
  component: TestCaseDetailPage,
})
