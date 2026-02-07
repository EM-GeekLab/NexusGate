import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { PlusIcon, Trash2Icon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'

import { TestCaseEditor } from './test-case-editor'

export function ComparePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showEditor, setShowEditor] = useState(false)

  const { data } = useQuery({
    queryKey: ['playground', 'test-cases'],
    queryFn: async () => {
      const { data } = await api.admin.playground['test-cases'].get({ query: { limit: 100 } })
      return data
    },
  })

  const testCases = data?.data || []

  const handleCreate = async (tc: {
    title: string
    description?: string
    messages: { role: string; content: string }[]
    params?: Record<string, unknown>
  }) => {
    const { data: created } = await api.admin.playground['test-cases'].post(tc)
    if (created?.id) {
      toast.success(t('pages.playground.compare.TestCaseCreated'))
      queryClient.invalidateQueries({ queryKey: ['playground', 'test-cases'] })
      setShowEditor(false)
      navigate({ to: '/playground/compare/$testCaseId', params: { testCaseId: String(created.id) } })
    } else {
      toast.error(t('pages.playground.compare.CreateFailed'))
    }
  }

  const handleDelete = async (id: number) => {
    await api.admin.playground['test-cases']({ id }).delete()
    toast.success(t('pages.playground.compare.TestCaseDeleted'))
    queryClient.invalidateQueries({ queryKey: ['playground', 'test-cases'] })
  }

  if (showEditor) {
    return (
      <div className="p-4 md:p-6">
        <TestCaseEditor onSave={handleCreate} onCancel={() => setShowEditor(false)} />
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4 md:p-6">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t('pages.playground.compare.TestCases')}</h2>
          <Button size="sm" className="gap-2" onClick={() => setShowEditor(true)}>
            <PlusIcon className="size-4" />
            {t('pages.playground.compare.NewTestCase')}
          </Button>
        </div>

        {testCases.length === 0 ? (
          <p className="text-muted-foreground py-12 text-center text-sm">{t('pages.playground.compare.NoTestCases')}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {testCases.map(
              (tc: {
                id: number
                title: string
                description: string | null
                messages: { role: string; content: string }[]
                updatedAt: string
              }) => (
                <Card key={tc.id} className="group relative">
                  <Link to="/playground/compare/$testCaseId" params={{ testCaseId: String(tc.id) }}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">{tc.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {tc.description && (
                        <p className="text-muted-foreground mb-2 line-clamp-2 text-xs">{tc.description}</p>
                      )}
                      <p className="text-muted-foreground text-xs">
                        {tc.messages?.length || 0} {t('pages.playground.compare.Messages').toLowerCase()}
                      </p>
                    </CardContent>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100"
                    onClick={(e) => {
                      e.preventDefault()
                      handleDelete(tc.id)
                    }}
                  >
                    <Trash2Icon className="size-3.5" />
                  </Button>
                </Card>
              ),
            )}
          </div>
        )}
      </div>
    </ScrollArea>
  )
}
