import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export type ViewMode = 'builtin' | 'grafana'

interface ViewModeToggleProps {
  value: ViewMode
  onChange: (mode: ViewMode) => void
}

export function ViewModeToggle({ value, onChange }: ViewModeToggleProps) {
  const { t } = useTranslation()

  return (
    <div className="inline-flex items-center rounded-md border p-0.5">
      <Button
        variant="ghost"
        size="xs"
        className={cn(value === 'builtin' && 'bg-accent')}
        onClick={() => onChange('builtin')}
      >
        {t('pages.overview.viewMode.builtin')}
      </Button>
      <Button
        variant="ghost"
        size="xs"
        className={cn(value === 'grafana' && 'bg-accent')}
        onClick={() => onChange('grafana')}
      >
        {t('pages.overview.viewMode.grafana')}
      </Button>
    </div>
  )
}
