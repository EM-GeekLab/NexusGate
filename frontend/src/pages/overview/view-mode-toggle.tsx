import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { GrafanaDashboard } from '@/hooks/use-settings'

interface ViewModeToggleProps {
  value: string // 'builtin' or dashboard id
  onChange: (mode: string) => void
  dashboards: GrafanaDashboard[]
}

export function ViewModeToggle({ value, onChange, dashboards }: ViewModeToggleProps) {
  const { t } = useTranslation()

  return (
    <div className="inline-flex items-center rounded-md border p-0.5" role="group" aria-label={t('pages.overview.viewMode.label')}>
      <Button
        variant="ghost"
        size="xs"
        className={cn(value === 'builtin' && 'bg-accent')}
        onClick={() => onChange('builtin')}
        aria-pressed={value === 'builtin'}
      >
        {t('pages.overview.viewMode.builtin')}
      </Button>
      {dashboards.map((dashboard) => (
        <Button
          key={dashboard.id}
          variant="ghost"
          size="xs"
          className={cn(value === dashboard.id && 'bg-accent')}
          onClick={() => onChange(dashboard.id)}
          aria-pressed={value === dashboard.id}
        >
          {dashboard.label}
        </Button>
      ))}
    </div>
  )
}
