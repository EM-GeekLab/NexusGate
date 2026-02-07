import { useCallback, useRef, useState } from 'react'

import { backendBaseURL } from '@/lib/api'

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

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

type UseChatStreamingOptions = {
  model: string
  apiKey: string
  params?: PlaygroundParams
  onChunk?: (content: string) => void
  onDone?: (fullContent: string) => void
  onError?: (error: string) => void
}

export function useChatStreaming({ model, apiKey, params, onChunk, onDone, onError }: UseChatStreamingOptions) {
  const [isStreaming, setIsStreaming] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Use refs for callbacks to avoid stale closures during long-running async streaming
  const onChunkRef = useRef(onChunk)
  const onDoneRef = useRef(onDone)
  const onErrorRef = useRef(onError)
  onChunkRef.current = onChunk
  onDoneRef.current = onDone
  onErrorRef.current = onError

  const sendMessage = useCallback(
    async (messages: ChatMessage[]) => {
      if (!model || !apiKey) return

      abortControllerRef.current?.abort()
      const controller = new AbortController()
      abortControllerRef.current = controller
      setIsStreaming(true)

      // Build messages list with optional system prompt
      const allMessages: ChatMessage[] = []
      if (params?.systemPrompt) {
        allMessages.push({ role: 'system', content: params.systemPrompt })
      }
      allMessages.push(...messages)

      try {
        const response = await fetch(`${backendBaseURL}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: allMessages,
            stream: true,
            ...(params?.temperature !== undefined && { temperature: params.temperature }),
            ...(params?.topP !== undefined && { top_p: params.topP }),
            ...(params?.maxTokens !== undefined && { max_tokens: params.maxTokens }),
            ...(params?.stopSequences?.length && { stop: params.stopSequences }),
            ...(params?.frequencyPenalty !== undefined && { frequency_penalty: params.frequencyPenalty }),
            ...(params?.presencePenalty !== undefined && { presence_penalty: params.presencePenalty }),
          }),
          signal: controller.signal,
        })

        if (!response.ok) {
          const text = await response.text()
          onErrorRef.current?.(text || `HTTP ${response.status}`)
          setIsStreaming(false)
          return
        }

        const reader = response.body?.getReader()
        if (!reader) {
          onErrorRef.current?.('No response body')
          setIsStreaming(false)
          return
        }

        const decoder = new TextDecoder()
        let fullContent = ''
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          // Keep the last potentially incomplete line in the buffer
          buffer = lines.pop() || ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed || !trimmed.startsWith('data: ')) continue
            const data = trimmed.slice(6)
            if (data === '[DONE]') continue

            try {
              const parsed = JSON.parse(data)
              const content = parsed.choices?.[0]?.delta?.content
              if (content) {
                fullContent += content
                onChunkRef.current?.(fullContent)
              }
            } catch {
              // Skip unparseable lines
            }
          }
        }

        onDoneRef.current?.(fullContent)
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          onErrorRef.current?.((err as Error).message || 'Stream error')
        }
      } finally {
        setIsStreaming(false)
        abortControllerRef.current = null
      }
    },
    [model, apiKey, params],
  )

  const stopStreaming = useCallback(() => {
    abortControllerRef.current?.abort()
  }, [])

  return { sendMessage, stopStreaming, isStreaming }
}
