import { omit } from '@/lib/utils'

import { useRequestDetailContext } from './index'
import { TokenUsage } from './token-usage'

import { useTranslation } from 'react-i18next'

export function MessagesRawView() {
  const { t } = useTranslation()

  const data = useRequestDetailContext()

  return (
    <div className="flex flex-col gap-4 px-4">
      <MessagesCodePreview
        title={t('pages.requests.detail-panel.raw-view.RawData')}
        messages={omit(data, ['prompt', 'completion', 'promptTokens', 'completionTokens'])}
      />
      <MessagesCodePreview title={t('pages.requests.detail-panel.raw-view.RequestMessages')} messages={data.prompt.messages} tokens={data.promptTokens} />
      <MessagesCodePreview title={t('pages.requests.detail-panel.raw-view.ResponseMessages')} messages={data.completion} tokens={data.completionTokens} />
    </div>
  )
}

function MessagesCodePreview({ title, messages, tokens }: { title?: string; messages?: unknown; tokens?: number }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center gap-2 px-2">
        <h3 className="text-sm font-medium">{title}</h3>
        <TokenUsage tokens={tokens} />
      </div>
      <pre className="bg-muted/50 overflow-auto rounded-md p-4 font-mono text-xs whitespace-pre-wrap">
        {JSON.stringify(messages, null, 2)}
      </pre>
    </div>
  )
}
