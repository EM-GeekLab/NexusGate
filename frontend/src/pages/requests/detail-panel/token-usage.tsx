import { match } from 'ts-pattern'

import { formatNumber } from '@/lib/utils'

import { useTranslation } from 'react-i18next'

export function TokenUsage({ tokens }: { tokens?: number }) {
  const { t } = useTranslation()
  
  const usage = match(tokens)
    .with(undefined, () => null)
    .with(-1, () => t('Src_pages_requests_detail-panel_token-usage_NoTokenData'))
    .with(1, () => t('Src_pages_requests_detail-panel_token-usage_OneToken'))
    .otherwise((tokens) => `${formatNumber(tokens)} tokens`)

  return usage && <div className="text-muted-foreground text-xs">{usage}</div>
}
