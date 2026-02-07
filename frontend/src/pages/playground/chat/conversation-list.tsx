import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { MessageSquarePlusIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'

type ConversationListProps = {
  activeId?: number
}

export function ConversationList({ activeId }: ConversationListProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const { data } = useQuery({
    queryKey: ['playground', 'conversations'],
    queryFn: async () => {
      const { data } = await api.admin.playground.conversations.get({ query: { limit: 100 } })
      return data
    },
  })

  const conversations = data?.data || []

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-3">
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-2"
          onClick={() => navigate({ to: '/playground/chat' })}
        >
          <MessageSquarePlusIcon className="size-4" />
          {t('pages.playground.chat.NewChat')}
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-1 p-2">
          {conversations.length === 0 && (
            <p className="text-muted-foreground px-3 py-6 text-center text-xs">
              {t('pages.playground.chat.NoConversations')}
            </p>
          )}
          {conversations.map((conv: { id: number; title: string; model: string; updatedAt: string }) => (
            <Link
              key={conv.id}
              to="/playground/chat/$conversationId"
              params={{ conversationId: String(conv.id) }}
              className={cn(
                'block truncate rounded-md px-3 py-2 text-sm transition-colors',
                activeId === conv.id
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {conv.title}
            </Link>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
