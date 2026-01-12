import { useState, type ComponentProps } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PlusIcon, RefreshCwIcon } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const modelSchema = z.object({
  systemName: z.string().min(1).max(63),
  remoteId: z.string().max(63).optional(),
  modelType: z.enum(['chat', 'embedding']),
  weight: z.number().min(0).max(100).default(1),
  contextLength: z.number().min(0).optional(),
})

type ModelFormValues = z.infer<typeof modelSchema>

interface ModelAddButtonProps extends ComponentProps<typeof Button> {
  providerId: number
}

export function ModelAddButton({ providerId, size = 'sm', ...props }: ModelAddButtonProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()

  const form = useForm<ModelFormValues>({
    resolver: zodResolver(modelSchema),
    defaultValues: {
      systemName: '',
      remoteId: '',
      modelType: 'chat',
      weight: 1,
      contextLength: undefined,
    },
  })

  // Fetch remote models from provider
  const {
    data: remoteModels,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['remote-models', providerId],
    queryFn: async () => {
      const { data, error } = await api.admin.providers({ id: providerId })['remote-models'].get()
      if (error) return null
      return data?.models ?? []
    },
    enabled: open,
  })

  const mutation = useMutation({
    mutationFn: async (values: ModelFormValues) => {
      const { data, error } = await api.admin.models.post({
        providerId,
        ...values,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers'] })
      queryClient.invalidateQueries({ queryKey: ['provider-models', providerId] })
      toast.success(t('pages.settings.models.ModelCreated'))
      setOpen(false)
      form.reset()
    },
    onError: () => {
      toast.error(t('pages.settings.models.CreateFailed'))
    },
  })

  const onSubmit = (values: ModelFormValues) => {
    mutation.mutate(values)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size={size} variant="outline" {...props}>
          <PlusIcon className="mr-2 h-4 w-4" />
          {t('pages.settings.models.AddModel')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('pages.settings.models.AddModel')}</DialogTitle>
          <DialogDescription>{t('pages.settings.models.AddModelDescription')}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="systemName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('pages.settings.models.SystemName')}</FormLabel>
                  <div className="flex gap-2">
                    <FormControl>
                      <Input placeholder={t('pages.settings.models.SystemNamePlaceholder')} {...field} />
                    </FormControl>
                    {remoteModels && remoteModels.length > 0 && (
                      <Select
                        onValueChange={(value) => {
                          field.onChange(value)
                          form.setValue('remoteId', value)
                        }}
                      >
                        <SelectTrigger className="w-[140px]">
                          <SelectValue placeholder={t('pages.settings.models.SelectModel')} />
                        </SelectTrigger>
                        <SelectContent>
                          {remoteModels.map((m: { id: string }) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.id}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <Button type="button" variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching}>
                      <RefreshCwIcon className={isFetching ? 'animate-spin' : ''} />
                    </Button>
                  </div>
                  <FormDescription>{t('pages.settings.models.SystemNameDescription')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="remoteId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('pages.settings.models.RemoteId')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('pages.settings.models.RemoteIdPlaceholder')} {...field} />
                  </FormControl>
                  <FormDescription>{t('pages.settings.models.RemoteIdDescription')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="modelType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('pages.settings.models.ModelType')}</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t('pages.settings.models.ModelTypePlaceholder')} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="chat">{t('pages.settings.models.columns.Chat')}</SelectItem>
                      <SelectItem value="embedding">{t('pages.settings.models.columns.Embedding')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>{t('pages.settings.models.ModelTypeDescription')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="weight"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('pages.settings.models.Weight')}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormDescription>{t('pages.settings.models.WeightDescription')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="contextLength"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('pages.settings.models.ContextLength')}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        placeholder="128000"
                        {...field}
                        value={field.value ?? ''}
                        onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                      />
                    </FormControl>
                    <FormDescription>{t('pages.settings.models.ContextLengthDescription')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t('pages.settings.models.Cancel')}
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {t('pages.settings.models.Save')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
