import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { api } from '@/lib/api'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type ModelApiKeySelectorProps = {
  model: string
  onModelChange: (model: string) => void
  apiKey: string
  onApiKeyChange: (apiKey: string) => void
}

export function ModelApiKeySelector({ model, onModelChange, apiKey, onApiKeyChange }: ModelApiKeySelectorProps) {
  const { t } = useTranslation()

  const { data: modelsData } = useQuery({
    queryKey: ['models', 'list'],
    queryFn: async () => {
      const { data } = await api.admin.models.get()
      return data
    },
  })

  const { data: apiKeysData } = useQuery({
    queryKey: ['apiKeys', 'list'],
    queryFn: async () => {
      const { data } = await api.admin.apiKey.get()
      return data
    },
  })

  // Get unique system names from models
  const modelNames = [...new Set((modelsData || []).map((m: { systemName: string }) => m.systemName))].sort()
  const apiKeys = (apiKeysData || []).filter((k: { revoked: boolean }) => !k.revoked)

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-xs font-medium">{t('pages.playground.chat.Model')}</span>
        <Select value={model} onValueChange={onModelChange}>
          <SelectTrigger className="h-8 w-48">
            <SelectValue placeholder={t('pages.playground.chat.SelectModel')} />
          </SelectTrigger>
          <SelectContent>
            {modelNames.map((name) => (
              <SelectItem key={name as string} value={name as string}>
                {name as string}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-xs font-medium">{t('pages.playground.chat.APIKey')}</span>
        <Select value={apiKey} onValueChange={onApiKeyChange}>
          <SelectTrigger className="h-8 w-56">
            <SelectValue placeholder={t('pages.playground.chat.SelectAPIKey')} />
          </SelectTrigger>
          <SelectContent>
            {apiKeys.map((k: { key: string; comment: string | null }) => (
              <SelectItem key={k.key} value={k.key}>
                {k.comment || k.key.slice(0, 12) + '...'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
