import { useEffect } from 'react'
import { useQueryErrorResetBoundary } from '@tanstack/react-query'
import { useRouter, type ErrorComponentProps } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

export function AppErrorComponent({ error }: ErrorComponentProps) {
  const router = useRouter()
  const queryErrorResetBoundary = useQueryErrorResetBoundary()
  const { t } = useTranslation()

  useEffect(() => {
    queryErrorResetBoundary.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset 只需要在组件挂载时调用一次
  }, [])

  return (
    <div className="flex flex-col items-center px-4 py-10">
      <div className="bg-background flex flex-col items-center gap-4 rounded-lg border px-6 py-4 sm:min-w-[280px]">
        <h3 className="text-muted-foreground font-medium">{t('components.app.app-error.Error')}</h3>
        <p className="text-sm">{error.message}</p>
        <Button variant="outline" onClick={() => router.invalidate()}>
          {t('components.app.app-error.Retry')}
        </Button>
      </div>
    </div>
  )
}
