import { useEffect, useRef } from 'react'
import { BotIcon, FlaskConicalIcon, MoreHorizontalIcon, SaveIcon, Trash2Icon, UserIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Markdown } from '@/components/app/markdown'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

import type { ChatMessage } from './use-chat-streaming'

type MessageListProps = {
  messages: ChatMessage[]
  isStreaming: boolean
  onClear?: () => void
  onDelete?: () => void
  onSaveAsTestCase?: () => void
}

export function MessageList({ messages, isStreaming, onClear, onDelete, onSaveAsTestCase }: MessageListProps) {
  const { t } = useTranslation()
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: isStreaming ? 'instant' : 'smooth' })
  }, [messages, isStreaming])

  if (messages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
        <FlaskConicalIcon className="text-muted-foreground size-12" />
        <h2 className="text-lg font-medium">{t('pages.playground.chat.WelcomeTitle')}</h2>
        <p className="text-muted-foreground text-sm">{t('pages.playground.chat.WelcomeDescription')}</p>
      </div>
    )
  }

  return (
    <div className="relative">
      {/* Actions menu */}
      {(onClear || onDelete || onSaveAsTestCase) && (
        <div className="sticky top-0 z-10 flex justify-end p-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontalIcon className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onSaveAsTestCase && (
                <DropdownMenuItem onClick={onSaveAsTestCase}>
                  <SaveIcon className="mr-2 size-4" />
                  {t('pages.playground.chat.SaveAsTestCase')}
                </DropdownMenuItem>
              )}
              {onClear && (
                <DropdownMenuItem onClick={onClear}>
                  <Trash2Icon className="mr-2 size-4" />
                  {t('pages.playground.chat.ClearMessages')}
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem onClick={onDelete} className="text-destructive">
                  <Trash2Icon className="mr-2 size-4" />
                  {t('pages.playground.chat.DeleteConversation')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <div className="space-y-4 px-4 pb-4">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
            <div className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-full">
              {msg.role === 'user' ? <UserIcon className="size-4" /> : <BotIcon className="size-4" />}
            </div>
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2 ${
                msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
              }`}
            >
              {msg.role === 'user' ? (
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              ) : (
                <Markdown text={msg.content || '...'} />
              )}
            </div>
          </div>
        ))}
        {isStreaming && messages[messages.length - 1]?.role !== 'assistant' && (
          <div className="flex gap-3">
            <div className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-full">
              <BotIcon className="size-4" />
            </div>
            <div className="bg-muted rounded-lg px-4 py-2">
              <div className="flex gap-1">
                <span
                  className="bg-foreground/30 size-2 animate-bounce rounded-full"
                  style={{ animationDelay: '0ms' }}
                />
                <span
                  className="bg-foreground/30 size-2 animate-bounce rounded-full"
                  style={{ animationDelay: '150ms' }}
                />
                <span
                  className="bg-foreground/30 size-2 animate-bounce rounded-full"
                  style={{ animationDelay: '300ms' }}
                />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
