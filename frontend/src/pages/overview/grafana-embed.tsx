import { useTranslation } from 'react-i18next'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function GrafanaEmbed({ url }: { url: string }) {
  const { t } = useTranslation()

  // Append kiosk param to hide Grafana navigation chrome
  const embedUrl = new URL(url)
  if (!embedUrl.searchParams.has('kiosk')) {
    embedUrl.searchParams.set('kiosk', '')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('pages.overview.grafana.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <iframe
          src={embedUrl.toString()}
          className="h-[800px] w-full rounded border-0"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          loading="lazy"
          title="Grafana Dashboard"
        />
      </CardContent>
    </Card>
  )
}
