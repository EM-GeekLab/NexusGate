import { useState, type KeyboardEvent } from 'react'
import { SendIcon, SquareIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

type ChatInputProps = {
  onSend: (content: string) => void
  onStop: () => void
  isStreaming: boolean
  disabled?: boolean
}

export function ChatInput({ onSend, onStop, isStreaming, disabled }: ChatInputProps) {
  const { t } = useTranslation()
  const [input, setInput] = useState('')

  const handleSend = () => {
    const trimmed = input.trim()
    if (!trimmed) return
    onSend(trimmed)
    setInput('')
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!isStreaming && !disabled) {
        handleSend()
      }
    }
    if (e.key === 'Escape' && isStreaming) {
      onStop()
    }
  }

  return (
    <div className="border-t p-4">
      <div className="relative">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('pages.playground.chat.TypeMessage')}
          className="min-h-[60px] resize-none pr-14"
          rows={2}
          disabled={disabled}
        />
        <div className="absolute right-2 bottom-2">
          {isStreaming ? (
            <Button size="icon" variant="destructive" className="h-8 w-8" onClick={onStop}>
              <SquareIcon className="size-4" />
              <span className="sr-only">{t('pages.playground.chat.Stop')}</span>
            </Button>
          ) : (
            <Button size="icon" className="h-8 w-8" onClick={handleSend} disabled={disabled || !input.trim()}>
              <SendIcon className="size-4" />
              <span className="sr-only">{t('pages.playground.chat.Send')}</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
