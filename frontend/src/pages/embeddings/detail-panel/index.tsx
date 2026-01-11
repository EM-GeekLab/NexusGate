import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { CheckIcon, CopyIcon, XIcon } from 'lucide-react'

import { api } from '@/lib/api'
import { cn, formatNumber } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'

import { useEmbeddingDetail } from '../embedding-detail-provider'

import { useTranslation } from 'react-i18next'

export function DetailPanel() {
  const { t } = useTranslation()
  const { selectedEmbeddingId, setSelectedEmbeddingId, isSelectedEmbedding } = useEmbeddingDetail()

  const { data: embedding, isLoading } = useQuery({
    queryKey: ['embedding', selectedEmbeddingId],
    queryFn: async () => {
      if (!selectedEmbeddingId) return null
      const { data, error } = await api.admin.embeddings({ id: selectedEmbeddingId }).get()
      if (error) throw error
      return data
    },
    enabled: !!selectedEmbeddingId,
  })

  if (!isSelectedEmbedding) return null

  return (
    <div className="bg-background flex w-full flex-col border-l lg:w-[400px] xl:w-[500px]">
      <div className="flex items-center justify-between border-b p-3">
        <h2 className="font-semibold">{t('pages.embeddings.detail-panel.EmbeddingDetails')}</h2>
        <Button variant="ghost" size="icon" onClick={() => setSelectedEmbeddingId(undefined)}>
          <XIcon className="size-4" />
        </Button>
      </div>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-muted-foreground">{t('pages.embeddings.detail-panel.Loading')}</div>
        </div>
      ) : embedding ? (
        <ScrollArea className="flex-1">
          <div className="space-y-4 p-4">
            {/* Metadata */}
            <div className="space-y-2">
              <div className="text-muted-foreground text-sm">{t('pages.embeddings.detail-panel.Model')}</div>
              <div className="font-mono text-sm">{embedding.model}</div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1">
                <div className="text-muted-foreground text-sm">{t('pages.embeddings.detail-panel.Tokens')}</div>
                <div className="font-mono text-sm">{formatNumber(embedding.inputTokens)}</div>
              </div>
              <div className="space-y-1">
                <div className="text-muted-foreground text-sm">{t('pages.embeddings.detail-panel.Dimensions')}</div>
                <div className="font-mono text-sm">{formatNumber(embedding.dimensions)}</div>
              </div>
              <div className="space-y-1">
                <div className="text-muted-foreground text-sm">{t('pages.embeddings.detail-panel.Duration')}</div>
                <div className="font-mono text-sm">{(embedding.duration / 1000).toFixed(2)}s</div>
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-muted-foreground text-sm">{t('pages.embeddings.detail-panel.CreatedAt')}</div>
              <div className="font-mono text-sm">{format(embedding.createdAt, 'PPpp')}</div>
            </div>

            {/* Input Text */}
            <div className="space-y-2">
              <div className="text-muted-foreground text-sm">{t('pages.embeddings.detail-panel.InputText')}</div>
              <div className="bg-muted/50 rounded-md border p-3">
                <pre className="whitespace-pre-wrap break-words font-mono text-sm">
                  {Array.isArray(embedding.input)
                    ? embedding.input.map((text, i) => (
                        <div key={i} className="mb-2 last:mb-0">
                          <span className="text-muted-foreground">[{i + 1}]</span> {text}
                        </div>
                      ))
                    : embedding.input}
                </pre>
              </div>
            </div>

            {/* Embedding Vector */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-muted-foreground text-sm">
                  {t('pages.embeddings.detail-panel.EmbeddingVector')} ({embedding.dimensions} {t('pages.embeddings.detail-panel.Dims')})
                </div>
                <CopyButton text={JSON.stringify(embedding.embedding)} />
              </div>
              <div className="bg-muted/50 max-h-[300px] overflow-auto rounded-md border p-3">
                <pre className="font-mono text-xs">
                  {embedding.embedding.map((vec, i) => (
                    <div key={i} className="mb-2 last:mb-0">
                      {Array.isArray(embedding.input) && embedding.input.length > 1 && (
                        <div className="text-muted-foreground mb-1">[{i + 1}]</div>
                      )}
                      [{vec.slice(0, 10).map((v) => v.toFixed(6)).join(', ')}
                      {vec.length > 10 && `, ... (${vec.length - 10} more)`}]
                    </div>
                  ))}
                </pre>
              </div>
            </div>
          </div>
        </ScrollArea>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-muted-foreground">{t('pages.embeddings.detail-panel.NotFound')}</div>
        </div>
      )}
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={handleCopy}>
      {copied ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />}
      {copied ? t('pages.embeddings.detail-panel.Copied') : t('pages.embeddings.detail-panel.CopyAll')}
    </Button>
  )
}
