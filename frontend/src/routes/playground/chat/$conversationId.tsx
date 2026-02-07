import { createFileRoute } from '@tanstack/react-router'

import { ChatPage } from '@/pages/playground/chat/chat-page'

export const Route = createFileRoute('/playground/chat/$conversationId')({
  component: ChatPage,
})
