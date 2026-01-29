import { useMemo } from 'react'
import { useTheme } from 'next-themes'
import { useTranslation } from 'react-i18next'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function GrafanaEmbed({ url }: { url: string }) {
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()

  // Parse and modify URL safely, handling invalid URLs gracefully
  const embedUrl = useMemo(() => {
    try {
      const parsed = new URL(url)
      // Add kiosk mode to hide Grafana navigation
      if (!parsed.searchParams.has('kiosk')) {
        parsed.searchParams.set('kiosk', '')
      }
      // Sync theme with NexusGate (light/dark)
      if (resolvedTheme && !parsed.searchParams.has('theme')) {
        parsed.searchParams.set('theme', resolvedTheme === 'dark' ? 'dark' : 'light')
      }
      return parsed.toString()
    } catch {
      return null
    }
  }, [url, resolvedTheme])

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
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>{t('pages.overview.grafana.title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        <iframe
          src={embedUrl}
          className="min-h-[calc(100vh-280px)] w-full rounded border-0"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          loading="lazy"
          title={t('pages.overview.grafana.title')}
        />
      </CardContent>
    </Card>
  )
}
