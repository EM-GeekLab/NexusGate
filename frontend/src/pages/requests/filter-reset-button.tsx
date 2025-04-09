import type { ComponentProps } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'

import { Button } from '@/components/ui/button'

import { useTranslation } from 'react-i18next'

export function FilterResetButton({ className, ...props }: ComponentProps<typeof Button>) {
  const { t } = useTranslation()
  
  const { apiKeyId, upstreamId, ...rest } = useSearch({ from: '/requests/' })
  const hasFilters = Boolean(apiKeyId || upstreamId)
  const navigate = useNavigate()

  return (
    hasFilters && (
      <Button
        className={className}
        size="xs"
        variant="outline"
        onClick={() => navigate({ to: '/requests', search: { ...rest } })}
        {...props}
      >
        {t('Src_pages_requests_filter-reset-button_ClearFilters')}
      </Button>
    )
  )
}
