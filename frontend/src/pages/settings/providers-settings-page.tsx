import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { BoxesIcon, PlusIcon, XIcon } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Form, FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  getApiVersionPlaceholder,
  PROVIDER_TYPE_LABELS,
  PROVIDER_TYPES,
  requiresApiVersion,
} from '@/constants/providers'

import { ManageModelsDialog } from './manage-models-dialog'
import type { Provider } from './providers-columns'

const providerSchema = z.object({
  name: z.string().min(1).max(63),
  type: z.enum(PROVIDER_TYPES).default('openai'),
  baseUrl: z.string().min(1).max(255).url(),
  apiKey: z.string().max(255).optional(),
  apiVersion: z.string().max(31).optional(),
})

type ProviderFormValues = z.infer<typeof providerSchema>

export function ProvidersSettingsPage({ data }: { data: Provider[] }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const form = useForm<ProviderFormValues>({
    resolver: zodResolver(providerSchema),
    defaultValues: {
      name: '',
      type: 'openai',
      baseUrl: '',
      apiKey: '',
      apiVersion: '',
    },
  })

  const watchType = form.watch('type')

  const createMutation = useMutation({
    mutationFn: async (values: ProviderFormValues) => {
      const { data, error } = await api.admin.providers.post(values)
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers'] })
      toast.success(t('pages.settings.providers.ProviderCreated'))
      form.reset()
    },
    onError: () => {
      toast.error(t('pages.settings.providers.CreateFailed'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await api.admin.providers({ id }).delete()
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers'] })
      toast.success(t('pages.settings.providers.ProviderDeleted'))
    },
    onError: () => {
      toast.error(t('pages.settings.providers.DeleteFailed'))
    },
  })

  const testMutation = useMutation({
    mutationFn: async (id: number) => {
      const { data, error } = await api.admin.providers({ id }).test.post()
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      // API returns { success: true, models: [...] }
      const response = data as { success: boolean; models: { id: string }[] }
      const modelCount = response.models?.length || 0
      toast.success(
        t('pages.settings.providers.TestSuccess') +
          ` - ${t('pages.settings.providers.ModelsFound', { count: modelCount })}`,
      )
    },
    onError: () => {
      toast.error(t('pages.settings.providers.TestFailed'))
    },
  })

  const onSubmit = (values: ProviderFormValues) => {
    createMutation.mutate(values)
  }

  return (
    <div className="space-y-8">
      <Card>
        <CardContent className="pt-6">
          <div className="mb-6 flex items-center gap-3">
            <div className="bg-primary/10 flex size-10 items-center justify-center rounded-lg">
              <PlusIcon className="text-primary size-5" />
            </div>
            <h3 className="text-lg font-semibold">{t('routes.settings.providers.AddNew')}</h3>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <div className="grid grid-cols-2 gap-5">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('routes.settings.providers.ProviderName')}</FormLabel>
                      <FormControl>
                        <Input placeholder={t('routes.settings.providers.ProviderNamePlaceholder')} {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('routes.settings.providers.ProviderType')}</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {PROVIDER_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>
                              {PROVIDER_TYPE_LABELS[type]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="baseUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Base URL</FormLabel>
                    <FormControl>
                      <Input placeholder={t('routes.settings.providers.BaseURLPlaceholder')} {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="apiKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>API Key</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="sk-..." {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />

              {requiresApiVersion(watchType) && (
                <FormField
                  control={form.control}
                  name="apiVersion"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('pages.settings.providers.APIVersion')}</FormLabel>
                      <FormControl>
                        <Input placeholder={getApiVersionPlaceholder(watchType)} {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              )}

              <div className="flex justify-end pt-2">
                <Button type="submit" disabled={createMutation.isPending}>
                  {t('routes.settings.providers.Save')}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <div>
        <h3 className="text-muted-foreground mb-5 text-sm font-medium">
          {t('routes.settings.providers.ConfiguredProviders')}
        </h3>
        <div className="space-y-4">
          {data.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              onTest={() => testMutation.mutate(provider.id)}
              onDelete={() => deleteMutation.mutate(provider.id)}
              isTestPending={testMutation.isPending}
              isDeletePending={deleteMutation.isPending}
            />
          ))}
          {data.length === 0 && (
            <div className="text-muted-foreground py-12 text-center text-sm">
              {t('routes.settings.providers.NoProviders')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface ProviderCardProps {
  provider: Provider
  onTest: () => void
  onDelete: () => void
  isTestPending: boolean
  isDeletePending: boolean
}

function ProviderCard({ provider, onTest, onDelete, isTestPending, isDeletePending }: ProviderCardProps) {
  const { t } = useTranslation()
  const [showModelsDialog, setShowModelsDialog] = useState(false)

  return (
    <>
      <Card>
        <CardContent className="flex items-center justify-between gap-4 px-6 py-5">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <div className="bg-muted flex size-12 shrink-0 items-center justify-center rounded-lg">
              <BoxesIcon className="text-muted-foreground size-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3">
                <span className="truncate text-base font-medium">{provider.name}</span>
                <span className="bg-muted shrink-0 rounded px-2 py-0.5 text-xs uppercase">{provider.type}</span>
              </div>
              <div className="text-muted-foreground mt-1 truncate text-sm">
                {provider.baseUrl}
                <span className="mx-2">·</span>
                {t('routes.settings.providers.CreatedAt')}{' '}
                {formatDistanceToNow(new Date(provider.createdAt), { addSuffix: true })}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => setShowModelsDialog(true)}>
              <BoxesIcon className="mr-2 size-4" />
              {t('routes.settings.providers.Models')}
            </Button>
            <Button variant="outline" size="sm" onClick={onTest} disabled={isTestPending}>
              Test
            </Button>
            <Button variant="ghost" size="icon" onClick={onDelete} disabled={isDeletePending}>
              <XIcon className="size-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <ManageModelsDialog open={showModelsDialog} onOpenChange={setShowModelsDialog} provider={provider} />
    </>
  )
}
