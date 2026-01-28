import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function GrafanaEmbed({ url }: { url: string }) {
  const { t } = useTranslation()

  // Parse and modify URL safely, handling invalid URLs gracefully
  const embedUrl = useMemo(() => {
    try {
      const parsed = new URL(url)
      if (!parsed.searchParams.has('kiosk')) {
        parsed.searchParams.set('kiosk', '')
      }
      return parsed.toString()
    } catch {
      return null
    }
  }, [url])

  if (!embedUrl) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('pages.overview.grafana.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-[200px] items-center justify-center text-muted-foreground">
            {t('pages.overview.grafana.invalidUrl')}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('pages.overview.grafana.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <iframe
          src={embedUrl}
          className="h-[800px] w-full rounded border-0"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          loading="lazy"
          title={t('pages.overview.grafana.title')}
        />
      </CardContent>
    </Card>
  )
}
