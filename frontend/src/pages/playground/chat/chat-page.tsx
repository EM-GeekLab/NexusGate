import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { api } from '@/lib/api'
import { useIsMobile } from '@/hooks/use-mobile'

import { ChatInput } from './chat-input'
import { ConversationList } from './conversation-list'
import { MessageList } from './message-list'
import { ModelApiKeySelector } from './model-api-key-selector'
import { ParameterSidebar } from './parameter-sidebar'
import { useChatStreaming, type ChatMessage } from './use-chat-streaming'

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

export function ChatPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const params = useParams({ strict: false })
  const conversationId = params && 'conversationId' in params ? Number(params.conversationId) : undefined
  const isMobile = useIsMobile()

  const [model, setModel] = useState('')
  const [apiKeyValue, setApiKeyValue] = useState('')
  const [playgroundParams, setPlaygroundParams] = useState<PlaygroundParams>({})
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streamingContent, setStreamingContent] = useState('')
  const [currentConvId, setCurrentConvId] = useState<number | undefined>(conversationId)
  const currentConvIdRef = useRef(currentConvId)

  // Keep ref in sync with state
  const updateCurrentConvId = useCallback((id: number | undefined) => {
    currentConvIdRef.current = id
    setCurrentConvId(id)
  }, [])

  // Load conversation when ID changes
  const { data: conversationData } = useQuery({
    queryKey: ['playground', 'conversation', conversationId],
    queryFn: async () => {
      if (!conversationId) return null

      const { data } = await api.admin.playground.conversations({ id: conversationId }).get()
      return data
    },
    enabled: !!conversationId,
  })

  useEffect(() => {
    if (conversationData) {
      setModel(conversationData.model || '')
      setPlaygroundParams(conversationData.params || {})
      if (conversationData.apiKeyId) {
        // We'll resolve the key value from the API keys list
      }
      const msgs = (conversationData.messages || []).map((m: { role: string; content: string }) => ({
        role: m.role as ChatMessage['role'],
        content: m.content,
      }))
      setMessages(msgs)
      updateCurrentConvId(conversationData.id)
    }
  }, [conversationData, updateCurrentConvId])

  // Reset when navigating to new chat (no ID)
  useEffect(() => {
    if (!conversationId) {
      setMessages([])
      setStreamingContent('')
      updateCurrentConvId(undefined)
    }
  }, [conversationId, updateCurrentConvId])

  const streamingContentRef = useRef('')

  const { sendMessage, stopStreaming, isStreaming } = useChatStreaming({
    model,
    apiKey: apiKeyValue,
    params: playgroundParams,
    onChunk: (content) => {
      streamingContentRef.current = content
      setStreamingContent(content)
    },
    onDone: async (fullContent) => {
      streamingContentRef.current = ''
      setStreamingContent('')
      const assistantMsg: ChatMessage = { role: 'assistant', content: fullContent }
      setMessages((prev) => [...prev, assistantMsg])

      // Save assistant message to DB (use ref to avoid stale closure)
      const convId = currentConvIdRef.current
      if (convId) {
        try {
          await api.admin.playground.conversations({ id: convId }).messages.post({
            role: 'assistant',
            content: fullContent,
          })
        } catch {
          // Message already shown locally; silent failure is acceptable
        }
      }
      queryClient.invalidateQueries({ queryKey: ['playground', 'conversations'] })
    },
    onError: (error) => {
      streamingContentRef.current = ''
      setStreamingContent('')
      toast.error(t('pages.playground.chat.FetchError'), { description: error })
    },
  })

  const handleSend = useCallback(
    async (content: string) => {
      const userMsg: ChatMessage = { role: 'user', content }

      let convId = currentConvId

      // Create conversation if new
      if (!convId) {
        const title = content.slice(0, 50) + (content.length > 50 ? '...' : '')
        try {
          const { data: newConv } = await api.admin.playground.conversations.post({
            title,
            model,
            params: playgroundParams,
          })
          if (!newConv?.id) return
          convId = newConv.id
          updateCurrentConvId(convId)
        } catch (err) {
          toast.error(t('pages.playground.chat.FetchError'), {
            description: err instanceof Error ? err.message : 'Failed to create conversation',
          })
          return
        }
      }

      // Save user message
      try {
        await api.admin.playground.conversations({ id: convId }).messages.post({ role: 'user', content })
      } catch (err) {
        toast.error(t('pages.playground.chat.FetchError'), {
          description: err instanceof Error ? err.message : 'Failed to save message',
        })
        return
      }

      setMessages((prev) => [...prev, userMsg])
      sendMessage([...messages, userMsg])
    },
    [currentConvId, model, playgroundParams, sendMessage, updateCurrentConvId, t, messages],
  )

  const handleDeleteConversation = useCallback(async () => {
    if (!currentConvId) return

    await api.admin.playground.conversations({ id: currentConvId }).delete()
    queryClient.invalidateQueries({ queryKey: ['playground', 'conversations'] })
    navigate({ to: '/playground/chat' })
  }, [currentConvId, navigate, queryClient])

  const handleClearMessages = useCallback(async () => {
    if (!currentConvId) return

    await api.admin.playground.conversations({ id: currentConvId }).messages.delete()
    setMessages([])
  }, [currentConvId])

  const handleSaveAsTestCase = useCallback(async () => {
    if (messages.length === 0) return

    try {
      await api.admin.playground['test-cases'].post({
        title: conversationData?.title || 'Untitled Test Case',
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        params: playgroundParams,
      })
      toast.success(t('pages.playground.chat.SavedAsTestCase'))
    } catch (err) {
      toast.error(t('pages.playground.chat.FetchError'), {
        description: err instanceof Error ? err.message : 'Failed to save test case',
      })
    }
  }, [messages, conversationData, playgroundParams, t])

  // Build display messages with streaming
  const displayMessages = [...messages]
  if (isStreaming && streamingContent) {
    displayMessages.push({ role: 'assistant', content: streamingContent })
  }

  return (
    <div className="flex h-full">
      {/* Conversation list sidebar */}
      {!isMobile && (
        <div className="w-60 shrink-0 border-r">
          <ConversationList activeId={currentConvId} />
        </div>
      )}

      {/* Main chat area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Model / API Key selector */}
        <div className="border-b px-4 py-2">
          <ModelApiKeySelector
            model={model}
            onModelChange={setModel}
            apiKey={apiKeyValue}
            onApiKeyChange={setApiKeyValue}
          />
        </div>

        {/* Messages */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <MessageList
            messages={displayMessages}
            isStreaming={isStreaming}
            onClear={messages.length > 0 ? handleClearMessages : undefined}
            onDelete={currentConvId ? handleDeleteConversation : undefined}
            onSaveAsTestCase={messages.length > 0 ? handleSaveAsTestCase : undefined}
          />
        </div>

        {/* Input */}
        <ChatInput
          onSend={handleSend}
          onStop={stopStreaming}
          isStreaming={isStreaming}
          disabled={!model || !apiKeyValue}
        />
      </div>

      {/* Parameter sidebar */}
      {!isMobile && (
        <div className="w-72 shrink-0 border-l">
          <ParameterSidebar params={playgroundParams} onChange={setPlaygroundParams} />
        </div>
      )}
    </div>
  )
}
