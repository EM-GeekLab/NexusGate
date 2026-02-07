import { useCallback, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from '@tanstack/react-router'
import { ArrowLeftIcon, PlayIcon, Trash2Icon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { api, backendBaseURL } from '@/lib/api'
import { Markdown } from '@/components/app/markdown'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'

import { ModelApiKeySelector } from '../chat/model-api-key-selector'
import { TestCaseEditor } from './test-case-editor'

export function TestCaseDetailPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { testCaseId } = useParams({ from: '/playground/compare/$testCaseId' })
  const id = Number(testCaseId)

  const [isEditing, setIsEditing] = useState(false)
  const [selectedModels, setSelectedModels] = useState<string[]>([])
  const [model, setModel] = useState('')
  const [apiKeyValue, setApiKeyValue] = useState('')
  const [isRunning, setIsRunning] = useState(false)

  const { data: testCase } = useQuery({
    queryKey: ['playground', 'test-case', id],
    queryFn: async () => {
      const { data } = await api.admin.playground['test-cases']({ id }).get()
      return data
    },
  })

  const { data: runsData, refetch: refetchRuns } = useQuery({
    queryKey: ['playground', 'test-runs', id],
    queryFn: async () => {
      const { data } = await api.admin.playground['test-runs'].get({ query: { testCaseId: id, limit: 20 } })
      return data
    },
  })

  const testRuns = runsData?.data || []

  const handleUpdate = async (data: {
    title: string
    description?: string
    messages: { role: string; content: string }[]
  }) => {
    await api.admin.playground['test-cases']({ id }).put(data)
    toast.success(t('pages.playground.compare.TestCaseUpdated'))
    queryClient.invalidateQueries({ queryKey: ['playground', 'test-case', id] })
    queryClient.invalidateQueries({ queryKey: ['playground', 'test-cases'] })
    setIsEditing(false)
  }

  const handleDelete = async () => {
    await api.admin.playground['test-cases']({ id }).delete()
    toast.success(t('pages.playground.compare.TestCaseDeleted'))
    queryClient.invalidateQueries({ queryKey: ['playground', 'test-cases'] })
    navigate({ to: '/playground/compare' })
  }

  // Add model to comparison list
  const toggleModel = useCallback(() => {
    if (model && !selectedModels.includes(model)) {
      setSelectedModels((prev) => [...prev, model])
    }
  }, [model, selectedModels])

  const removeModel = (m: string) => {
    setSelectedModels((prev) => prev.filter((x) => x !== m))
  }

  const handleRunComparison = useCallback(async () => {
    if (selectedModels.length === 0 || !apiKeyValue || !testCase) return
    setIsRunning(true)

    try {
      // Create test run

      const { data: run } = await api.admin.playground['test-runs'].post({
        testCaseId: id,
        models: selectedModels,
      })
      if (!run?.id) return

      // Build messages from test case
      const messages = (testCase.messages || []).map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content,
      }))

      // Add system prompt if present
      const allMessages = testCase.params?.systemPrompt
        ? [{ role: 'system', content: (testCase.params as { systemPrompt: string }).systemPrompt }, ...messages]
        : messages

      // Run each model in parallel
      const results = run.results || []
      await Promise.allSettled(
        results.map(async (result: { id: number; model: string }) => {
          const startTime = Date.now()

          await api.admin.playground['test-results']({ id: result.id }).put({ status: 'running' })

          try {
            const response = await fetch(`${backendBaseURL}/v1/chat/completions`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKeyValue}`,
              },
              body: JSON.stringify({
                model: result.model,
                messages: allMessages,
                stream: false,
                ...(testCase.params?.temperature !== undefined && {
                  temperature: (testCase.params as { temperature: number }).temperature,
                }),
                ...(testCase.params?.maxTokens !== undefined && {
                  max_tokens: (testCase.params as { maxTokens: number }).maxTokens,
                }),
              }),
            })

            const duration = Date.now() - startTime
            const data = await response.json()

            if (!response.ok) {
              await api.admin.playground['test-results']({ id: result.id }).put({
                status: 'failed',
                errorMessage: data.error?.message || `HTTP ${response.status}`,
                duration,
              })
              return
            }

            const content = data.choices?.[0]?.message?.content || ''
            const promptTokens = data.usage?.prompt_tokens || 0
            const completionTokens = data.usage?.completion_tokens || 0

            await api.admin.playground['test-results']({ id: result.id }).put({
              status: 'completed',
              response: content,
              promptTokens,
              completionTokens,
              duration,
            })
          } catch (err) {
            const duration = Date.now() - startTime

            await api.admin.playground['test-results']({ id: result.id }).put({
              status: 'failed',
              errorMessage: (err as Error).message,
              duration,
            })
          }
        }),
      )

      refetchRuns()
    } finally {
      setIsRunning(false)
    }
  }, [selectedModels, apiKeyValue, testCase, id, refetchRuns])

  if (!testCase) return null

  if (isEditing) {
    return (
      <div className="p-4 md:p-6">
        <TestCaseEditor
          initialData={
            testCase as { title: string; description?: string | null; messages: { role: string; content: string }[] }
          }
          onSave={handleUpdate}
          onCancel={() => setIsEditing(false)}
        />
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4 md:p-6">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => navigate({ to: '/playground/compare' })}
          >
            <ArrowLeftIcon className="size-4" />
          </Button>
          <div className="flex-1">
            <h2 className="text-lg font-semibold">{testCase.title}</h2>
            {testCase.description && <p className="text-muted-foreground text-sm">{testCase.description}</p>}
          </div>
          <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
            Edit
          </Button>
          <Button variant="outline" size="sm" className="text-destructive" onClick={handleDelete}>
            <Trash2Icon className="mr-1 size-3.5" />
            {t('pages.playground.compare.DeleteTestCase')}
          </Button>
        </div>

        {/* Messages preview */}
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t('pages.playground.compare.Messages')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(testCase.messages as { role: string; content: string }[])?.map((m, idx) => (
                <div key={idx} className="flex gap-2 text-sm">
                  <Badge variant="outline" className="shrink-0">
                    {m.role}
                  </Badge>
                  <span className="text-muted-foreground line-clamp-2">{m.content}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Run comparison */}
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t('pages.playground.compare.RunComparison')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ModelApiKeySelector
              model={model}
              onModelChange={setModel}
              apiKey={apiKeyValue}
              onApiKeyChange={setApiKeyValue}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={toggleModel} disabled={!model}>
                + Add Model
              </Button>
              {selectedModels.map((m) => (
                <Badge key={m} variant="secondary" className="cursor-pointer gap-1" onClick={() => removeModel(m)}>
                  {m} &times;
                </Badge>
              ))}
            </div>
            <Button
              size="sm"
              className="gap-2"
              disabled={selectedModels.length === 0 || !apiKeyValue || isRunning}
              onClick={handleRunComparison}
            >
              <PlayIcon className="size-3.5" />
              {isRunning ? t('pages.playground.compare.Running') : t('pages.playground.compare.RunComparison')}
            </Button>
          </CardContent>
        </Card>

        {/* Test runs */}
        <h3 className="mb-3 text-sm font-medium">{t('pages.playground.compare.TestRuns')}</h3>
        {testRuns.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">{t('pages.playground.compare.NoRuns')}</p>
        ) : (
          <div className="space-y-4">
            {testRuns.map((run: { id: number; models: string[]; createdAt: string }) => (
              <TestRunCard key={run.id} runId={run.id} />
            ))}
          </div>
        )}
      </div>
    </ScrollArea>
  )
}

function TestRunCard({ runId }: { runId: number }) {
  const { t } = useTranslation()

  const { data } = useQuery({
    queryKey: ['playground', 'test-run', runId],
    queryFn: async () => {
      const { data } = await api.admin.playground['test-runs']({ id: runId }).get()
      return data
    },
    refetchInterval: (query) => {
      // Auto-refresh while results are pending/running
      const results = query.state.data?.results || []
      const hasActive = results.some((r: { status: string }) => r.status === 'pending' || r.status === 'running')
      return hasActive ? 2000 : false
    },
  })

  if (!data) return null

  const results = data.results || []

  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-muted-foreground mb-3 text-xs">{new Date(data.createdAt).toLocaleString()}</div>
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(results.length, 4)}, 1fr)` }}>
          {results.map(
            (result: {
              id: number
              model: string
              status: string
              response: string | null
              promptTokens: number | null
              completionTokens: number | null
              duration: number | null
              errorMessage: string | null
            }) => (
              <div key={result.id} className="min-w-0 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="truncate text-xs font-medium">{result.model}</span>
                  <Badge
                    variant={
                      result.status === 'completed'
                        ? 'default'
                        : result.status === 'failed'
                          ? 'destructive'
                          : 'secondary'
                    }
                    className="text-[10px]"
                  >
                    {t(
                      `pages.playground.compare.${result.status.charAt(0).toUpperCase() + result.status.slice(1)}` as Parameters<
                        typeof t
                      >[0],
                    )}
                  </Badge>
                </div>

                {result.status === 'completed' && result.response && (
                  <div className="bg-muted max-h-48 overflow-y-auto rounded-md p-2">
                    <Markdown text={result.response} />
                  </div>
                )}

                {result.status === 'failed' && result.errorMessage && (
                  <p className="text-destructive text-xs">{result.errorMessage}</p>
                )}

                {result.status === 'completed' && (
                  <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
                    {result.promptTokens != null && (
                      <span>
                        {t('pages.playground.compare.PromptTokens')}: {result.promptTokens}
                      </span>
                    )}
                    {result.completionTokens != null && (
                      <span>
                        {t('pages.playground.compare.CompletionTokens')}: {result.completionTokens}
                      </span>
                    )}
                    {result.duration != null && (
                      <span>
                        {t('pages.playground.compare.Duration')}: {(result.duration / 1000).toFixed(1)}s
                      </span>
                    )}
                  </div>
                )}

                {(result.status === 'pending' || result.status === 'running') && (
                  <div className="flex items-center gap-2 py-3">
                    <div className="border-primary h-4 w-4 animate-spin rounded-full border-2 border-t-transparent" />
                    <span className="text-muted-foreground text-xs">{t('pages.playground.compare.Running')}</span>
                  </div>
                )}
              </div>
            ),
          )}
        </div>
      </CardContent>
    </Card>
  )
}
