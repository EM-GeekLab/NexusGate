import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'

type PlaygroundParams = {
  systemPrompt?: string
  temperature?: number
  topP?: number
  topK?: number
  maxTokens?: number
  stopSequences?: string[]
  frequencyPenalty?: number
  presencePenalty?: number
}

type ParameterSidebarProps = {
  params: PlaygroundParams
  onChange: (params: PlaygroundParams) => void
}

export function ParameterSidebar({ params, onChange }: ParameterSidebarProps) {
  const { t } = useTranslation()
  const [localStopSequences, setLocalStopSequences] = useState(params.stopSequences?.join(', ') || '')

  // Sync local state when params.stopSequences changes from outside
  useEffect(() => {
    setLocalStopSequences(params.stopSequences?.join(', ') || '')
  }, [params.stopSequences])

  const update = (key: keyof PlaygroundParams, value: unknown) => {
    onChange({ ...params, [key]: value })
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-5 p-4">
        <h3 className="text-sm font-medium">{t('pages.playground.chat.Parameters')}</h3>

        {/* System Prompt */}
        <div className="space-y-2">
          <Label className="text-xs">{t('pages.playground.chat.SystemPrompt')}</Label>
          <Textarea
            value={params.systemPrompt || ''}
            onChange={(e) => update('systemPrompt', e.target.value || undefined)}
            placeholder={t('pages.playground.chat.SystemPromptPlaceholder')}
            className="min-h-[80px] resize-none text-xs"
            rows={3}
          />
        </div>

        {/* Temperature */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">{t('pages.playground.chat.Temperature')}</Label>
            <span className="text-muted-foreground text-xs">{params.temperature ?? 1}</span>
          </div>
          <Slider
            min={0}
            max={2}
            step={0.1}
            value={[params.temperature ?? 1]}
            onValueChange={([v]) => update('temperature', v)}
          />
        </div>

        {/* Top P */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">{t('pages.playground.chat.TopP')}</Label>
            <span className="text-muted-foreground text-xs">{params.topP ?? 1}</span>
          </div>
          <Slider min={0} max={1} step={0.05} value={[params.topP ?? 1]} onValueChange={([v]) => update('topP', v)} />
        </div>

        {/* Max Tokens */}
        <div className="space-y-2">
          <Label className="text-xs">{t('pages.playground.chat.MaxTokens')}</Label>
          <Input
            type="number"
            min={1}
            value={params.maxTokens || ''}
            onChange={(e) => update('maxTokens', e.target.value ? Number(e.target.value) : undefined)}
            placeholder="4096"
            className="h-8 text-xs"
          />
        </div>

        {/* Frequency Penalty */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">{t('pages.playground.chat.FrequencyPenalty')}</Label>
            <span className="text-muted-foreground text-xs">{params.frequencyPenalty ?? 0}</span>
          </div>
          <Slider
            min={-2}
            max={2}
            step={0.1}
            value={[params.frequencyPenalty ?? 0]}
            onValueChange={([v]) => update('frequencyPenalty', v)}
          />
        </div>

        {/* Presence Penalty */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">{t('pages.playground.chat.PresencePenalty')}</Label>
            <span className="text-muted-foreground text-xs">{params.presencePenalty ?? 0}</span>
          </div>
          <Slider
            min={-2}
            max={2}
            step={0.1}
            value={[params.presencePenalty ?? 0]}
            onValueChange={([v]) => update('presencePenalty', v)}
          />
        </div>

        {/* Stop Sequences */}
        <div className="space-y-2">
          <Label className="text-xs">{t('pages.playground.chat.StopSequences')}</Label>
          <Input
            value={localStopSequences}
            onChange={(e) => setLocalStopSequences(e.target.value)}
            onBlur={() => {
              const parsed = localStopSequences
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
              update('stopSequences', parsed.length > 0 ? parsed : undefined)
            }}
            placeholder="token1, token2"
            className="h-8 text-xs"
          />
        </div>
      </div>
    </ScrollArea>
  )
}
