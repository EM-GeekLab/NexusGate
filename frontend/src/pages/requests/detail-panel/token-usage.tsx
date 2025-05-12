import { useTranslation } from 'react-i18next'
import { match } from 'ts-pattern'

import { formatNumber } from '@/lib/utils'

export function TokenUsage({ tokens }: { tokens?: number }) {
  const { t } = useTranslation()

  const usage = match(tokens)
    .with(undefined, () => null)
    .with(-1, () => t('pages.requests.detail-panel.token-usage.NoTokenData'))
    .with(1, () => t('pages.requests.detail-panel.token-usage.OneToken'))
    .otherwise((tokens) => `${formatNumber(tokens)} tokens`)

  return usage && <div className="text-muted-foreground text-xs">{usage}</div>
}
