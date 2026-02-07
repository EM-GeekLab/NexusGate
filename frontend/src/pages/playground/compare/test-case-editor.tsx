import { useState } from 'react'
import { PlusIcon, XIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

type Message = { role: string; content: string }

type TestCaseEditorProps = {
  initialData?: {
    title: string
    description?: string | null
    messages: Message[]
    params?: Record<string, unknown>
  }
  onSave: (data: { title: string; description?: string; messages: Message[]; params?: Record<string, unknown> }) => void
  onCancel: () => void
}

export function TestCaseEditor({ initialData, onSave, onCancel }: TestCaseEditorProps) {
  const { t } = useTranslation()
  const [title, setTitle] = useState(initialData?.title || '')
  const [description, setDescription] = useState(initialData?.description || '')
  const [messages, setMessages] = useState<Message[]>(initialData?.messages || [{ role: 'user', content: '' }])

  const addMessage = () => {
    setMessages([...messages, { role: 'user', content: '' }])
  }

  const removeMessage = (idx: number) => {
    setMessages(messages.filter((_, i) => i !== idx))
  }

  const updateMessage = (idx: number, field: keyof Message, value: string) => {
    const updated = [...messages]
    updated[idx] = { ...updated[idx], [field]: value }
    setMessages(updated)
  }

  const handleSave = () => {
    if (!title.trim()) return
    const validMessages = messages.filter((m) => m.content.trim())
    if (validMessages.length === 0) return
    onSave({
      title: title.trim(),
      description: description.trim() || undefined,
      messages: validMessages,
      ...(initialData?.params && { params: initialData.params }),
    })
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="space-y-2">
        <Label>{t('pages.playground.compare.Title')}</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      <div className="space-y-2">
        <Label>{t('pages.playground.compare.Description')}</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="resize-none"
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>{t('pages.playground.compare.Messages')}</Label>
          <Button variant="outline" size="sm" className="gap-1" onClick={addMessage}>
            <PlusIcon className="size-3" />
            {t('pages.playground.compare.AddMessage')}
          </Button>
        </div>

        {messages.map((msg, idx) => (
          <div key={idx} className="flex gap-2">
            <Select value={msg.role} onValueChange={(v) => updateMessage(idx, 'role', v)}>
              <SelectTrigger className="w-28 shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system">system</SelectItem>
                <SelectItem value="user">user</SelectItem>
                <SelectItem value="assistant">assistant</SelectItem>
              </SelectContent>
            </Select>
            <Textarea
              value={msg.content}
              onChange={(e) => updateMessage(idx, 'content', e.target.value)}
              placeholder={t('pages.playground.compare.Content')}
              rows={2}
              className="min-h-[60px] flex-1 resize-none"
            />
            {messages.length > 1 && (
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeMessage(idx)}>
                <XIcon className="size-4" />
              </Button>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={!title.trim() || !messages.some((m) => m.content.trim())}>
          {t('pages.playground.compare.Save')}
        </Button>
        <Button variant="outline" onClick={onCancel}>
          {t('pages.playground.compare.Cancel')}
        </Button>
      </div>
    </div>
  )
}
